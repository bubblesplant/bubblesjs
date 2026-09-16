import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { projects, projectMembers } from '@/database/schema'
import { AppException } from '@/common/exceptions/app.exception'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import {
  checkVersion,
  pageWindow,
  requireFound,
  searchSql,
  type AccessDb,
} from '@/modules/access/access.store'
import { MembersService } from '@/modules/members/members.service'
import { AdministratorsService } from '@/modules/members/administrators/administrators.service'
import { ProjectOrganizationInitializationService } from '@/modules/organization/initialization/project-organization-initialization.service'
import type {
  AccessScope,
  CreateProjectRequest,
  EntityPageQuery,
  ProjectDetail,
  ProjectRecord,
  SetAdministratorRequest,
  SetAdministratorResult,
  StatusRequest,
  UpdateProfileRequest,
} from 'shared/types'
import { normalizeOrganizationCode, toTimestampRecord } from 'shared/utils'

@Injectable()
export class ProjectsService {
  constructor(
    private readonly access: AccessService,
    private readonly members: MembersService,
    private readonly administrators: AdministratorsService,
    private readonly organizationInitialization: ProjectOrganizationInitializationService,
  ) {}

  /** 拒绝当前企业内与既有项目规范化编码冲突的创建或更新。 */
  private async assertUniqueCode(
    db: AccessDb,
    input: { companyId: string; code: string; excludeProjectId?: string },
  ) {
    const [duplicate] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.companyId, input.companyId),
          eq(
            sql<string>`lower(normalize(btrim(${projects.code}), NFKC))`,
            normalizeOrganizationCode(input.code),
          ),
          input.excludeProjectId ? ne(projects.id, input.excludeProjectId) : undefined,
        ),
      )
      .limit(1)
    if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
  }

  /** 按公司和项目标识共同查找项目，隔离跨公司访问并转换时间字段。 */
  async project(
    db: AccessDb,
    scope: { companyId: string; projectId: string },
  ): Promise<ProjectRecord> {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.companyId, scope.companyId), eq(projects.id, scope.projectId)))
    return toTimestampRecord(requireFound(row))
  }

  /** 读取公司内指定项目的资料，以及该项目直接分配的管理员状态。 */
  async projectDetail(
    db: AccessDb,
    scope: { companyId: string; projectId: string },
  ): Promise<ProjectDetail> {
    return {
      ...(await this.project(db, scope)),
      administrators: await this.administrators.administrators(db, { type: 'project', ...scope }),
    }
  }

  /**
   * 在公司项目读取权限下分页查询项目，普通成员仅能查询具有成员关系的项目。
   *
   * 公司管理员可查询公司内全部项目，支持状态、名称和编码筛选。
   */
  listProjects(input: { actor: AccessActor; companyId: string; query: EntityPageQuery }) {
    return this.access.read(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.projects.read',
      },
      /** 按操作者管理员身份限定项目可见范围，并在同一快照内读取总数和分页记录。 */
      async (tx, access) => {
        const { page, pageSize, offset } = pageWindow(input.query)
        const joined = tx
          .select({ id: projectMembers.projectId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.companyId, input.companyId),
              eq(projectMembers.userId, input.actor.userId),
            ),
          )
        const condition = and(
          eq(projects.companyId, input.companyId),
          input.query.status ? eq(projects.status, input.query.status) : undefined,
          access.administrator ? undefined : inArray(projects.id, joined),
          searchSql([projects.name, projects.code], input.query.query),
        )
        const [total] = await tx.select({ value: count() }).from(projects).where(condition)
        const rows = await tx
          .select()
          .from(projects)
          .where(condition)
          .orderBy(desc(projects.createdAt), desc(projects.id))
          .limit(pageSize)
          .offset(offset)
        return { items: rows.map(toTimestampRecord), total: total!.value, page, pageSize }
      },
    )
  }

  /**
   * 要求公司管理员具备创建权限，验证公司内编码唯一性和管理员成员资格后创建项目并记录审计。
   *
   * 同时初始化项目内置角色、首位管理员及显式选择的空白／模板组织快照，返回项目详情。
   */
  create(input: { actor: AccessActor; companyId: string; body: CreateProjectRequest }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.projects.create',
        adminOnly: true,
      },
      /** 校验初始管理员公司成员资格，原子创建项目、权限基线、组织快照及对应审计。 */
      async (tx, access) => {
        const user = await this.members.userForAdministrator(tx, {
          userId: input.body.administratorUserId,
          companyId: input.companyId,
        })
        await this.assertUniqueCode(tx, {
          companyId: input.companyId,
          code: input.body.code,
        })
        const [created] = await tx
          .insert(projects)
          .values({
            companyId: input.companyId,
            name: input.body.name,
            code: input.body.code,
            description: input.body.description ?? '',
          })
          .returning()
        const scope: AccessScope = {
          type: 'project',
          companyId: input.companyId,
          projectId: created!.id,
        }
        await this.administrators.initialize(tx, scope, user.id)
        const initialization = await this.organizationInitialization.initializeProject(tx, {
          companyId: input.companyId,
          projectId: created!.id,
          initialization: input.body.organizationInitialization,
          actor: input.actor,
          access,
        })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'project.create',
          objectType: 'project',
          objectId: created!.id,
          summary: {
            targetUserId: user.id,
            organizationInitializationMode: initialization.mode,
            organizationTemplateId: initialization.templateId,
            organizationTemplateVersion: initialization.templateVersion,
            organizationUnitCount: initialization.unitCount,
            positionCount: initialization.positionCount,
          },
        })
        return this.projectDetail(tx, scope)
      },
    )
  }

  /** 使用项目资料读取权限验证目标项目访问资格，返回项目资料及管理员列表。 */
  get(input: { actor: AccessActor; companyId: string; projectId: string }) {
    return this.access.read(
      {
        actor: input.actor,
        scope: { type: 'project', companyId: input.companyId, projectId: input.projectId },
        permission: 'project.profile.read',
      },
      (tx) => this.projectDetail(tx, { companyId: input.companyId, projectId: input.projectId }),
    )
  }

  /** 在项目作用域中校验修改权限、数据版本及公司内编码唯一性，更新项目资料并记录审计。 */
  profile(input: {
    actor: AccessActor
    companyId: string
    projectId: string
    body: UpdateProfileRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'project', companyId: input.companyId, projectId: input.projectId },
        permission: 'project.profile.update',
      },
      /** 读取项目版本并检查公司内编码唯一性，资料更新与审计同步提交。 */
      async (tx, access) => {
        const existing = await this.project(tx, input)
        checkVersion(existing.version, input.body.expectedVersion)
        if (input.body.code)
          await this.assertUniqueCode(tx, {
            companyId: input.companyId,
            code: input.body.code,
            excludeProjectId: existing.id,
          })
        const { expectedVersion: _, ...changes } = input.body
        await tx
          .update(projects)
          .set({ ...changes, version: sql`${projects.version} + 1`, updatedAt: new Date() })
          .where(and(eq(projects.companyId, input.companyId), eq(projects.id, existing.id)))
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'project.update',
          objectType: 'project',
          objectId: existing.id,
          summary: { changedFields: Object.keys(changes) },
        })
        return this.project(tx, input)
      },
    )
  }

  /**
   * 使用公司项目状态权限启停项目，普通操作者还必须具备目标项目成员关系。
   *
   * 校验客户端版本，启用时检查管理员完整性，并在事务内写入审计。
   */
  status(input: { actor: AccessActor; companyId: string; projectId: string; body: StatusRequest }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.projects.status',
      },
      /** 检查普通操作者的项目成员关系，变更状态后验证启用项目的管理员并写入审计。 */
      async (tx, access) => {
        const target = await this.project(tx, input)
        if (!access.administrator) {
          const [member] = await tx
            .select()
            .from(projectMembers)
            .where(
              and(
                eq(projectMembers.companyId, input.companyId),
                eq(projectMembers.projectId, input.projectId),
                eq(projectMembers.userId, input.actor.userId),
              ),
            )
          requireFound(member)
        }
        checkVersion(target.version, input.body.expectedVersion)
        await tx
          .update(projects)
          .set({
            status: input.body.status,
            version: sql`${projects.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(projects.companyId, input.companyId), eq(projects.id, target.id)))
        if (input.body.status === 'active')
          await this.access.assertAdministrators(tx, {
            companyId: input.companyId,
            projectId: input.projectId,
          })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'project.status',
          objectType: 'project',
          objectId: target.id,
          summary: { fromStatus: target.status, toStatus: input.body.status },
        })
        return this.project(tx, input)
      },
    )
  }

  /**
   * 要求公司管理员具备项目管理员设置权限，为公司内指定项目追加或替换管理员并记录审计。
   *
   * @returns 新管理员状态及被替换用户标识。
   */
  setAdministrator(input: {
    actor: AccessActor
    companyId: string
    projectId: string
    body: SetAdministratorRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.projects.administrator',
        adminOnly: true,
      },
      /** 先确认项目属于指定公司，再调整管理员关系并记录替换目标。 */
      async (tx, access): Promise<SetAdministratorResult> => {
        await this.project(tx, input)
        const scope: AccessScope = {
          type: 'project',
          companyId: input.companyId,
          projectId: input.projectId,
        }
        const user = await this.administrators.assign(tx, { scope, body: input.body })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'project.administrator.set',
          objectType: 'project',
          objectId: input.projectId,
          summary: {
            targetUserId: user.id,
            companyId: input.companyId,
            replacedUserId: input.body.replaceUserId ?? null,
          },
        })
        return {
          administrator: (await this.administrators.administrators(tx, scope)).find(
            (item) => item.id === user.id,
          )!,
          replacedUserId: input.body.replaceUserId ?? null,
        }
      },
    )
  }

  /** 要求公司管理员具备项目管理员设置权限，返回目标项目直接分配的管理员及其有效状态。 */
  projectAdministrators(input: { actor: AccessActor; companyId: string; projectId: string }) {
    return this.access.read(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.projects.administrator',
        adminOnly: true,
      },
      /** 确认项目存在且属于指定公司后读取其直接分配的管理员。 */
      async (tx) => {
        await this.project(tx, input)
        return this.administrators.administrators(tx, {
          type: 'project',
          companyId: input.companyId,
          projectId: input.projectId,
        })
      },
    )
  }
}
