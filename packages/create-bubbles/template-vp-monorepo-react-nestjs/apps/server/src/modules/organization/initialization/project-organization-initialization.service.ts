import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  organizationTemplates,
  organizationTrees,
  organizationUnits,
  positions,
} from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import {
  AccessService,
  type AccessActor,
  type VerifiedAccess,
} from '@/modules/access/access.service'
import { requireFound, type AccessTx } from '@/modules/access/access.store'
import type { ProjectOrganizationInitialization } from 'shared/types'
import { OrganizationTemplatesService } from '../templates/organization-templates.service'

export interface ProjectOrganizationInitializationResult {
  mode: 'blank' | 'template'
  templateId: string | null
  templateVersion: number | null
  unitCount: number
  positionCount: number
}

@Injectable()
export class ProjectOrganizationInitializationService {
  constructor(
    private readonly access: AccessService,
    private readonly templates: OrganizationTemplatesService,
  ) {}

  /** 创建项目唯一组织树，调用方必须与项目创建处于同一事务。 */
  private async createTree(
    tx: AccessTx,
    input: { companyId: string; projectId: string },
  ): Promise<string> {
    const [tree] = await tx
      .insert(organizationTrees)
      .values({
        scopeType: 'project',
        companyId: input.companyId,
        projectId: input.projectId,
      })
      .returning({ id: organizationTrees.id })
    return requireFound(tree).id
  }

  /**
   * 把模板指定版本的完整组织单元与岗位复制为项目独立资源，并保留来源子项 ID。
   */
  private async copyTemplate(
    tx: AccessTx,
    input: {
      companyId: string
      projectId: string
      treeId: string
      templateId: string
      templateVersion: number
    },
  ): Promise<{ unitCount: number; positionCount: number }> {
    const snapshot = await this.templates.snapshot(tx, {
      templateId: input.templateId,
      templateVersion: input.templateVersion,
    })
    const unitIds = new Map(snapshot.units.map((unit) => [unit.id, randomUUID()]))
    if (snapshot.units.length)
      await tx.insert(organizationUnits).values(
        snapshot.units.map((unit) => ({
          id: unitIds.get(unit.id)!,
          treeId: input.treeId,
          parentId: unit.parentId ? unitIds.get(unit.parentId)! : null,
          name: unit.name,
          nameKey: unit.nameKey,
          code: unit.code,
          codeKey: unit.codeKey,
          description: unit.description,
          sort: unit.sort,
          status: 'active' as const,
          sourceTemplateUnitId: unit.id,
        })),
      )
    if (snapshot.positions.length)
      await tx.insert(positions).values(
        snapshot.positions.map((position) => ({
          scopeType: 'project' as const,
          companyId: input.companyId,
          projectId: input.projectId,
          name: position.name,
          nameKey: position.nameKey,
          code: position.code,
          codeKey: position.codeKey,
          description: position.description,
          status: position.status,
          sourceTemplatePositionId: position.id,
        })),
      )
    return {
      unitCount: snapshot.units.length,
      positionCount: snapshot.positions.length,
    }
  }

  /**
   * 在项目创建事务内初始化空组织或复制当前企业模板，并以项目作用域写初始化审计。
   *
   * 模板模式额外要求企业模板读取权限，且只允许复制所属企业中启用的当前版本。
   */
  async initializeProject(
    tx: AccessTx,
    input: {
      companyId: string
      projectId: string
      initialization: ProjectOrganizationInitialization
      actor: AccessActor
      access: VerifiedAccess
    },
  ): Promise<ProjectOrganizationInitializationResult> {
    let result: ProjectOrganizationInitializationResult
    if (input.initialization.mode === 'blank') {
      await this.createTree(tx, input)
      result = {
        mode: 'blank',
        templateId: null,
        templateVersion: null,
        unitCount: 0,
        positionCount: 0,
      }
    } else {
      if (!input.access.permissionKeys.includes('company.organization.templates.read'))
        throw new AppException(ACCESS_ERRORS.FORBIDDEN)
      const [template] = await tx
        .select()
        .from(organizationTemplates)
        .where(
          and(
            eq(organizationTemplates.companyId, input.companyId),
            eq(organizationTemplates.id, input.initialization.templateId),
          ),
        )
        .limit(1)
      const currentTemplate = requireFound(template)
      if (currentTemplate.status !== 'active')
        throw new AppException(ACCESS_ERRORS.TEMPLATE_UNAVAILABLE)
      if (currentTemplate.version !== input.initialization.templateVersion)
        throw new AppException(ACCESS_ERRORS.TEMPLATE_VERSION_CONFLICT)
      const treeId = await this.createTree(tx, input)
      const counts = await this.copyTemplate(tx, {
        companyId: input.companyId,
        projectId: input.projectId,
        treeId,
        templateId: currentTemplate.id,
        templateVersion: currentTemplate.version,
      })
      result = {
        mode: 'template',
        templateId: currentTemplate.id,
        templateVersion: currentTemplate.version,
        ...counts,
      }
    }

    await this.access.audit(tx, {
      actor: input.actor,
      access: {
        ...input.access,
        scope: {
          type: 'project',
          companyId: input.companyId,
          projectId: input.projectId,
        },
      },
      action: 'project.organization.initialize',
      objectType: 'project',
      objectId: input.projectId,
      summary: {
        mode: result.mode,
        templateId: result.templateId,
        templateVersion: result.templateVersion,
        unitCount: result.unitCount,
        positionCount: result.positionCount,
      },
    })
    return result
  }
}
