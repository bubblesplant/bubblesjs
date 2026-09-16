import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, ne } from 'drizzle-orm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  organizationTemplatePositions,
  organizationTemplates,
  organizationTemplateUnits,
} from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import {
  AccessService,
  type AccessActor,
  type VerifiedAccess,
} from '@/modules/access/access.service'
import {
  checkVersion,
  pageWindow,
  requireFound,
  searchSql,
  type AccessDb,
  type AccessTx,
} from '@/modules/access/access.store'
import type {
  CreateOrganizationTemplateRequest,
  OrganizationTemplateListQuery,
  OrganizationTemplateRecord,
  OrganizationTemplateSummary,
  PageResult,
  ReplaceOrganizationTemplateRequest,
  UpdateOrganizationTemplateStatusRequest,
} from 'shared/types'
import { normalizeOrganizationKey } from 'shared/utils'
import {
  cloneTemplateSnapshot,
  prepareTemplateDefinition,
  type PreparedTemplatePosition,
  type PreparedTemplateUnit,
} from './organization-templates.store'

type TemplateRow = typeof organizationTemplates.$inferSelect

@Injectable()
export class OrganizationTemplatesService {
  constructor(private readonly access: AccessService) {}

  /** 按企业和模板 ID 共同读取模板，跨企业 ID 统一按不存在处理。 */
  private async templateRow(db: AccessDb, companyId: string, templateId: string) {
    const [row] = await db
      .select()
      .from(organizationTemplates)
      .where(
        and(
          eq(organizationTemplates.companyId, companyId),
          eq(organizationTemplates.id, templateId),
        ),
      )
    return requireFound(row)
  }

  /** 读取模板指定版本的完整组织单元和岗位快照。 */
  async snapshot(db: AccessDb, input: { templateId: string; templateVersion: number }) {
    const [units, positions] = await Promise.all([
      db
        .select()
        .from(organizationTemplateUnits)
        .where(
          and(
            eq(organizationTemplateUnits.templateId, input.templateId),
            eq(organizationTemplateUnits.templateVersion, input.templateVersion),
          ),
        )
        .orderBy(asc(organizationTemplateUnits.sort), asc(organizationTemplateUnits.id)),
      db
        .select()
        .from(organizationTemplatePositions)
        .where(
          and(
            eq(organizationTemplatePositions.templateId, input.templateId),
            eq(organizationTemplatePositions.templateVersion, input.templateVersion),
          ),
        )
        .orderBy(asc(organizationTemplatePositions.id)),
    ])
    return { units, positions }
  }

  /** 将完整子项定义插入模板的新不可变版本。 */
  private async insertSnapshot(
    tx: AccessTx,
    input: {
      templateId: string
      templateVersion: number
      units: PreparedTemplateUnit[]
      positions: PreparedTemplatePosition[]
    },
  ) {
    if (input.units.length)
      await tx.insert(organizationTemplateUnits).values(
        input.units.map((unit) => ({
          ...unit,
          templateId: input.templateId,
          templateVersion: input.templateVersion,
        })),
      )
    if (input.positions.length)
      await tx.insert(organizationTemplatePositions).values(
        input.positions.map((position) => ({
          ...position,
          templateId: input.templateId,
          templateVersion: input.templateVersion,
        })),
      )
  }

  /** 返回模板当前版本的完整公开记录。 */
  async record(db: AccessDb, row: TemplateRow): Promise<OrganizationTemplateRecord> {
    const snapshot = await this.snapshot(db, {
      templateId: row.id,
      templateVersion: row.version,
    })
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      description: row.description,
      status: row.status,
      isDefault: row.isDefault,
      version: row.version,
      units: snapshot.units.map((unit) => ({
        id: unit.id,
        parentId: unit.parentId,
        name: unit.name,
        code: unit.code,
        description: unit.description,
        sort: unit.sort,
        templateVersion: unit.templateVersion,
      })),
      positions: snapshot.positions.map((position) => ({
        id: position.id,
        name: position.name,
        code: position.code,
        description: position.description,
        status: position.status,
        templateVersion: position.templateVersion,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * 取消同企业另一个启用默认模板，同时复制其完整子项到下一版本并写独立审计。
   */
  private async unsetOtherDefault(
    tx: AccessTx,
    input: {
      companyId: string
      targetTemplateId: string
      actor: AccessActor
      access: VerifiedAccess
    },
  ) {
    const [oldDefault] = await tx
      .select()
      .from(organizationTemplates)
      .where(
        and(
          eq(organizationTemplates.companyId, input.companyId),
          eq(organizationTemplates.status, 'active'),
          eq(organizationTemplates.isDefault, true),
          ne(organizationTemplates.id, input.targetTemplateId),
        ),
      )
      .limit(1)
    if (!oldDefault) return
    const oldSnapshot = await this.snapshot(tx, {
      templateId: oldDefault.id,
      templateVersion: oldDefault.version,
    })
    const cloned = cloneTemplateSnapshot(oldSnapshot)
    const nextVersion = oldDefault.version + 1
    await this.insertSnapshot(tx, {
      templateId: oldDefault.id,
      templateVersion: nextVersion,
      ...cloned,
    })
    await tx
      .update(organizationTemplates)
      .set({ isDefault: false, version: nextVersion, updatedAt: new Date() })
      .where(eq(organizationTemplates.id, oldDefault.id))
    await this.access.audit(tx, {
      actor: input.actor,
      access: input.access,
      action: 'organization_template.status',
      objectType: 'organization_template',
      objectId: oldDefault.id,
      summary: {
        fromVersion: oldDefault.version,
        toVersion: nextVersion,
        fromIsDefault: true,
        toIsDefault: false,
      },
    })
  }

  /** 分页读取企业模板摘要，仅统计当前版本的组织单元和岗位数量。 */
  list(input: {
    actor: AccessActor
    companyId: string
    query: OrganizationTemplateListQuery
  }): Promise<PageResult<OrganizationTemplateSummary>> {
    return this.access.read(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.organization.templates.read',
      },
      async (tx) => {
        const { page, pageSize, offset } = pageWindow(input.query)
        const condition = and(
          eq(organizationTemplates.companyId, input.companyId),
          input.query.status ? eq(organizationTemplates.status, input.query.status) : undefined,
          searchSql([organizationTemplates.name], input.query.query),
        )
        const [total] = await tx
          .select({ value: count() })
          .from(organizationTemplates)
          .where(condition)
        const rows = await tx
          .select()
          .from(organizationTemplates)
          .where(condition)
          .orderBy(desc(organizationTemplates.createdAt), desc(organizationTemplates.id))
          .limit(pageSize)
          .offset(offset)
        const items = await Promise.all(
          rows.map(async (row): Promise<OrganizationTemplateSummary> => {
            const [unitCount, positionCount] = await Promise.all([
              tx
                .select({ value: count() })
                .from(organizationTemplateUnits)
                .where(
                  and(
                    eq(organizationTemplateUnits.templateId, row.id),
                    eq(organizationTemplateUnits.templateVersion, row.version),
                  ),
                ),
              tx
                .select({ value: count() })
                .from(organizationTemplatePositions)
                .where(
                  and(
                    eq(organizationTemplatePositions.templateId, row.id),
                    eq(organizationTemplatePositions.templateVersion, row.version),
                  ),
                ),
            ])
            return {
              id: row.id,
              companyId: row.companyId,
              name: row.name,
              description: row.description,
              status: row.status,
              isDefault: row.isDefault,
              version: row.version,
              unitCount: unitCount[0]?.value ?? 0,
              positionCount: positionCount[0]?.value ?? 0,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
            }
          }),
        )
        return { items, total: total?.value ?? 0, page, pageSize }
      },
    )
  }

  /** 读取企业模板当前版本的完整定义。 */
  get(input: { actor: AccessActor; companyId: string; templateId: string }) {
    return this.access.read(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.organization.templates.read',
      },
      async (tx) => this.record(tx, await this.templateRow(tx, input.companyId, input.templateId)),
    )
  }

  /** 创建模板聚合及其首个不可变子项快照，并按需原子切换企业默认模板。 */
  create(input: {
    actor: AccessActor
    companyId: string
    body: CreateOrganizationTemplateRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.organization.templates.create',
      },
      async (tx, access) => {
        const nameKey = normalizeOrganizationKey(input.body.name)
        const [duplicate] = await tx
          .select({ id: organizationTemplates.id })
          .from(organizationTemplates)
          .where(
            and(
              eq(organizationTemplates.companyId, input.companyId),
              eq(organizationTemplates.nameKey, nameKey),
            ),
          )
        if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        const definition = prepareTemplateDefinition(input.body)
        const templateId = randomUUID()
        if (input.body.isDefault)
          await this.unsetOtherDefault(tx, {
            companyId: input.companyId,
            targetTemplateId: templateId,
            actor: input.actor,
            access,
          })
        const [created] = await tx
          .insert(organizationTemplates)
          .values({
            id: templateId,
            companyId: input.companyId,
            name: input.body.name,
            nameKey,
            description: input.body.description ?? '',
            isDefault: input.body.isDefault ?? false,
          })
          .returning()
        await this.insertSnapshot(tx, {
          templateId,
          templateVersion: 1,
          ...definition,
        })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization_template.create',
          objectType: 'organization_template',
          objectId: templateId,
          summary: {
            version: 1,
            unitCount: definition.units.length,
            positionCount: definition.positions.length,
            isDefault: input.body.isDefault ?? false,
          },
        })
        return this.record(tx, created!)
      },
    )
  }

  /** 完整替换模板定义并生成下一份不可变子项版本快照。 */
  replace(input: {
    actor: AccessActor
    companyId: string
    templateId: string
    body: ReplaceOrganizationTemplateRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.organization.templates.update',
      },
      async (tx, access) => {
        const existing = await this.templateRow(tx, input.companyId, input.templateId)
        checkVersion(existing.version, input.body.expectedVersion)
        if (input.body.isDefault && existing.status !== 'active')
          throw new AppException(ACCESS_ERRORS.TEMPLATE_UNAVAILABLE)
        const nameKey = normalizeOrganizationKey(input.body.name)
        const [duplicate] = await tx
          .select({ id: organizationTemplates.id })
          .from(organizationTemplates)
          .where(
            and(
              eq(organizationTemplates.companyId, input.companyId),
              eq(organizationTemplates.nameKey, nameKey),
              ne(organizationTemplates.id, input.templateId),
            ),
          )
        if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        const definition = prepareTemplateDefinition(input.body)
        if (input.body.isDefault)
          await this.unsetOtherDefault(tx, {
            companyId: input.companyId,
            targetTemplateId: input.templateId,
            actor: input.actor,
            access,
          })
        const nextVersion = existing.version + 1
        await this.insertSnapshot(tx, {
          templateId: input.templateId,
          templateVersion: nextVersion,
          ...definition,
        })
        const [updated] = await tx
          .update(organizationTemplates)
          .set({
            name: input.body.name,
            nameKey,
            description: input.body.description ?? '',
            isDefault: input.body.isDefault,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(organizationTemplates.id, input.templateId))
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization_template.replace',
          objectType: 'organization_template',
          objectId: input.templateId,
          summary: {
            fromVersion: existing.version,
            toVersion: nextVersion,
            unitCount: definition.units.length,
            positionCount: definition.positions.length,
            isDefault: input.body.isDefault,
          },
        })
        return this.record(tx, updated!)
      },
    )
  }

  /** 变更模板状态或默认标记，并复制当前完整子项到下一版本。 */
  status(input: {
    actor: AccessActor
    companyId: string
    templateId: string
    body: UpdateOrganizationTemplateStatusRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.organization.templates.update',
      },
      async (tx, access) => {
        const existing = await this.templateRow(tx, input.companyId, input.templateId)
        checkVersion(existing.version, input.body.expectedVersion)
        const nextStatus = input.body.status ?? existing.status
        if (input.body.isDefault === true && nextStatus !== 'active')
          throw new AppException(ACCESS_ERRORS.TEMPLATE_UNAVAILABLE)
        const nextIsDefault =
          nextStatus === 'disabled' ? false : (input.body.isDefault ?? existing.isDefault)
        if (nextIsDefault)
          await this.unsetOtherDefault(tx, {
            companyId: input.companyId,
            targetTemplateId: input.templateId,
            actor: input.actor,
            access,
          })
        const currentSnapshot = await this.snapshot(tx, {
          templateId: input.templateId,
          templateVersion: existing.version,
        })
        const cloned = cloneTemplateSnapshot(currentSnapshot)
        const nextVersion = existing.version + 1
        await this.insertSnapshot(tx, {
          templateId: input.templateId,
          templateVersion: nextVersion,
          ...cloned,
        })
        const [updated] = await tx
          .update(organizationTemplates)
          .set({
            status: nextStatus,
            isDefault: nextIsDefault,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(organizationTemplates.id, input.templateId))
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization_template.status',
          objectType: 'organization_template',
          objectId: input.templateId,
          summary: {
            fromVersion: existing.version,
            toVersion: nextVersion,
            fromStatus: existing.status,
            toStatus: nextStatus,
            fromIsDefault: existing.isDefault,
            toIsDefault: nextIsDefault,
          },
        })
        return this.record(tx, updated!)
      },
    )
  }
}
