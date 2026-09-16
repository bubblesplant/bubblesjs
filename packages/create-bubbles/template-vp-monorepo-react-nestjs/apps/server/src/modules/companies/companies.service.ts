import { Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, isNull, max, ne, sql } from 'drizzle-orm'
import { companies, organizationTrees } from '@/database/schema'
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
import type {
  AccessScope,
  CompanyDetail,
  CompanyHierarchyDetail,
  CompanyHierarchyNode,
  CompanyHierarchyRecord,
  CompanyRecord,
  CreateCompanyRequest,
  EntityPageQuery,
  SetAdministratorRequest,
  SetAdministratorResult,
  StatusRequest,
  UpdateCompanyHierarchyRequest,
  UpdateProfileRequest,
} from 'shared/types'
import {
  normalizeOrganizationCode,
  normalizeOrganizationKey,
  ORGANIZATION_MAX_SORT,
} from 'shared/utils'

@Injectable()
export class CompaniesService {
  constructor(
    private readonly access: AccessService,
    private readonly members: MembersService,
    private readonly administrators: AdministratorsService,
  ) {}

  /** 查询企业数据库行；不存在时统一按不可见资源处理。 */
  private async companyRow(db: AccessDb, id: string) {
    const [row] = await db.select().from(companies).where(eq(companies.id, id))
    return requireFound(row)
  }

  /** 将数据库企业行裁剪为既有企业响应，避免层级内部字段污染旧接口。 */
  private companyRecord(row: typeof companies.$inferSelect): CompanyRecord {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** 将企业数据库行转换为仅供层级接口使用的公开记录。 */
  private hierarchyRecord(row: typeof companies.$inferSelect): CompanyHierarchyRecord {
    return {
      ...this.companyRecord(row),
      parentCompanyId: row.parentCompanyId,
      entityType: row.entityType,
      sort: row.sort,
    }
  }

  /** 读取指定公司并转换为既有企业接口格式；公司不存在时抛出资源不存在异常。 */
  async company(db: AccessDb, id: string): Promise<CompanyRecord> {
    return this.companyRecord(await this.companyRow(db, id))
  }

  /** 读取指定企业的层级字段，用于创建响应和层级变更响应。 */
  async companyHierarchy(db: AccessDb, id: string): Promise<CompanyHierarchyRecord> {
    return this.hierarchyRecord(await this.companyRow(db, id))
  }

  /** 在同一数据库上下文中读取公司资料及其直接分配的管理员状态。 */
  async companyDetail(db: AccessDb, id: string): Promise<CompanyDetail> {
    return {
      ...(await this.company(db, id)),
      administrators: await this.administrators.administrators(db, {
        type: 'company',
        companyId: id,
      }),
    }
  }

  /** 聚合企业层级记录和直接管理员，供创建企业响应使用。 */
  async companyHierarchyDetail(db: AccessDb, id: string): Promise<CompanyHierarchyDetail> {
    return {
      ...(await this.companyHierarchy(db, id)),
      administrators: await this.administrators.administrators(db, {
        type: 'company',
        companyId: id,
      }),
    }
  }

  /** 构造同级企业筛选条件，根级企业以 parent_company_id IS NULL 组成同一集合。 */
  private siblingFilter(parentCompanyId: string | null) {
    return parentCompanyId
      ? eq(companies.parentCompanyId, parentCompanyId)
      : isNull(companies.parentCompanyId)
  }

  /**
   * 校验目标父企业存在且不会使企业层级形成自身或后代循环。
   *
   * 创建企业时 companyId 省略，只验证父企业存在；更新时沿父链向上检查目标企业。
   */
  private async assertValidParent(
    db: AccessDb,
    input: { companyId?: string; parentCompanyId: string | null },
  ) {
    if (!input.parentCompanyId) return
    if (input.parentCompanyId === input.companyId)
      throw new AppException(ACCESS_ERRORS.ORGANIZATION_CYCLE)
    let current = await this.companyRow(db, input.parentCompanyId)
    const visited = new Set<string>()
    while (true) {
      if (current.id === input.companyId) throw new AppException(ACCESS_ERRORS.ORGANIZATION_CYCLE)
      if (visited.has(current.id)) throw new AppException(ACCESS_ERRORS.ORGANIZATION_CYCLE)
      visited.add(current.id)
      if (!current.parentCompanyId) return
      current = await this.companyRow(db, current.parentCompanyId)
    }
  }

  /** 拒绝同一父企业下规范化名称重复的其他企业。 */
  private async assertUniqueSiblingName(
    db: AccessDb,
    input: { parentCompanyId: string | null; nameKey: string; excludeCompanyId?: string },
  ) {
    const [duplicate] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          this.siblingFilter(input.parentCompanyId),
          eq(companies.nameKey, input.nameKey),
          input.excludeCompanyId ? ne(companies.id, input.excludeCompanyId) : undefined,
        ),
      )
      .limit(1)
    if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
  }

  /** 在目标父级计算下一个默认整数排序，达到上限时要求先人工调整现有顺序。 */
  private async nextSiblingSort(
    db: AccessDb,
    input: { parentCompanyId: string | null; excludeCompanyId?: string },
  ) {
    const [result] = await db
      .select({ value: max(companies.sort) })
      .from(companies)
      .where(
        and(
          this.siblingFilter(input.parentCompanyId),
          input.excludeCompanyId ? ne(companies.id, input.excludeCompanyId) : undefined,
        ),
      )
    if (result?.value === null || result?.value === undefined) return 1
    if (result.value >= ORGANIZATION_MAX_SORT)
      throw new AppException(ACCESS_ERRORS.ORGANIZATION_SORT_EXHAUSTED)
    return result.value + 1
  }

  /** 拒绝与任意现有企业规范化编码冲突的写入。 */
  private async assertUniqueCode(db: AccessDb, code: string, excludeCompanyId?: string) {
    const [duplicate] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(
            sql<string>`lower(normalize(btrim(${companies.code}), NFKC))`,
            normalizeOrganizationCode(code),
          ),
          excludeCompanyId ? ne(companies.id, excludeCompanyId) : undefined,
        ),
      )
      .limit(1)
    if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
  }

  /** 在平台公司读取权限下，按状态、公司名称或编码分页查询公司。 */
  listCompanies(input: { actor: AccessActor; query: EntityPageQuery }) {
    return this.access.read(
      { actor: input.actor, scope: { type: 'platform' }, permission: 'platform.companies.read' },
      /** 使用相同筛选条件查询公司总数和当前页，避免分页信息来自不同快照。 */
      async (tx) => {
        const { page, pageSize, offset } = pageWindow(input.query)
        const condition = and(
          input.query.status ? eq(companies.status, input.query.status) : undefined,
          searchSql([companies.name, companies.code], input.query.query),
        )
        const [total] = await tx.select({ value: count() }).from(companies).where(condition)
        const rows = await tx
          .select()
          .from(companies)
          .where(condition)
          .orderBy(desc(companies.createdAt), desc(companies.id))
          .limit(pageSize)
          .offset(offset)
        return {
          items: rows.map((row) => this.companyRecord(row)),
          total: total!.value,
          page,
          pageSize,
        }
      },
    )
  }

  /** 在平台企业读取权限下返回完整企业层级树，同级按 sort 与 id 稳定排序。 */
  hierarchyTree(input: { actor: AccessActor }) {
    return this.access.read(
      { actor: input.actor, scope: { type: 'platform' }, permission: 'platform.companies.read' },
      async (tx): Promise<CompanyHierarchyNode[]> => {
        const rows = await tx
          .select()
          .from(companies)
          .orderBy(asc(companies.sort), asc(companies.id))
        const nodes = new Map<string, CompanyHierarchyNode>(
          rows.map((row) => [row.id, { ...this.hierarchyRecord(row), children: [] }]),
        )
        const roots: CompanyHierarchyNode[] = []
        for (const row of rows) {
          const node = nodes.get(row.id)!
          if (row.parentCompanyId) nodes.get(row.parentCompanyId)?.children.push(node)
          else roots.push(node)
        }
        /** 递归稳定排序每个已组装父节点的直接子企业。 */
        const sortChildren = (items: CompanyHierarchyNode[]) => {
          items.sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id))
          for (const item of items) sortChildren(item.children)
        }
        sortChildren(roots)
        return roots
      },
    )
  }

  /**
   * 要求平台管理员具备创建权限，校验公司编码和管理员 userId 后创建公司及首位管理员并记录审计。
   *
   * @returns 新公司资料与管理员列表。
   */
  create(input: { actor: AccessActor; body: CreateCompanyRequest }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'platform' },
        permission: 'platform.companies.create',
        adminOnly: true,
      },
      /** 在同一事务内校验管理员账号、层级唯一性，创建公司、空组织树和首位管理员。 */
      async (tx, access) => {
        const user = await this.members.userForAdministrator(tx, {
          userId: input.body.administratorUserId,
        })
        const parentCompanyId = input.body.parentCompanyId ?? null
        await this.assertValidParent(tx, { parentCompanyId })
        const nameKey = normalizeOrganizationKey(input.body.name)
        await this.assertUniqueSiblingName(tx, { parentCompanyId, nameKey })
        await this.assertUniqueCode(tx, input.body.code)
        const sort = input.body.sort ?? (await this.nextSiblingSort(tx, { parentCompanyId }))
        const [created] = await tx
          .insert(companies)
          .values({
            parentCompanyId,
            entityType: input.body.entityType ?? 'company',
            name: input.body.name,
            nameKey,
            code: input.body.code,
            description: input.body.description ?? '',
            sort,
          })
          .returning()
        await tx.insert(organizationTrees).values({
          scopeType: 'company',
          companyId: created!.id,
          projectId: null,
        })
        await this.administrators.initialize(
          tx,
          { type: 'company', companyId: created!.id },
          user.id,
        )
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'company.create',
          objectType: 'company',
          objectId: created!.id,
          summary: {
            targetUserId: user.id,
            parentCompanyId,
            entityType: created!.entityType,
            sort,
          },
        })
        return this.companyHierarchyDetail(tx, created!.id)
      },
    )
  }

  /**
   * 在平台层级权限下调整父企业、展示类型和同级排序，并阻止循环与同级重名。
   *
   * 父级变化且未指定 sort 时排到新父级末尾；父级不变时省略 sort 会保留原值。
   */
  updateHierarchy(input: {
    actor: AccessActor
    companyId: string
    body: UpdateCompanyHierarchyRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'platform' },
        permission: 'platform.companies.hierarchy',
      },
      async (tx, access) => {
        const current = await this.companyRow(tx, input.companyId)
        checkVersion(current.version, input.body.expectedVersion)
        await this.assertValidParent(tx, {
          companyId: current.id,
          parentCompanyId: input.body.parentCompanyId,
        })
        await this.assertUniqueSiblingName(tx, {
          parentCompanyId: input.body.parentCompanyId,
          nameKey: current.nameKey,
          excludeCompanyId: current.id,
        })
        const parentChanged = current.parentCompanyId !== input.body.parentCompanyId
        const sort =
          input.body.sort ??
          (parentChanged
            ? await this.nextSiblingSort(tx, {
                parentCompanyId: input.body.parentCompanyId,
                excludeCompanyId: current.id,
              })
            : current.sort)
        await tx
          .update(companies)
          .set({
            parentCompanyId: input.body.parentCompanyId,
            entityType: input.body.entityType,
            sort,
            version: sql`${companies.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, current.id))
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'company.hierarchy.update',
          objectType: 'company',
          objectId: current.id,
          summary: {
            fromParentCompanyId: current.parentCompanyId,
            toParentCompanyId: input.body.parentCompanyId,
            fromEntityType: current.entityType,
            toEntityType: input.body.entityType,
            fromSort: current.sort,
            toSort: sort,
          },
        })
        return this.companyHierarchy(tx, current.id)
      },
    )
  }

  /**
   * 根据请求入口使用平台公司读取权限或公司资料读取权限，返回公司及管理员详情。
   *
   * @param input - platform 为 true 时按平台权限读取，默认使用公司作用域鉴权。
   */
  get(input: { actor: AccessActor; companyId: string; platform?: boolean }) {
    const scope: AccessScope = input.platform
      ? { type: 'platform' }
      : { type: 'company', companyId: input.companyId }
    return this.access.read(
      {
        actor: input.actor,
        scope,
        permission: input.platform ? 'platform.companies.read' : 'company.profile.read',
      },
      (tx) => this.companyDetail(tx, input.companyId),
    )
  }

  /** 在公司作用域内校验资料修改权限、数据版本和编码唯一性，更新资料并记录审计。 */
  profile(input: { actor: AccessActor; companyId: string; body: UpdateProfileRequest }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'company', companyId: input.companyId },
        permission: 'company.profile.update',
      },
      /** 检查公司版本与编码冲突，再将资料变更和字段审计一并写入。 */
      async (tx, access) => {
        const existing = await this.company(tx, input.companyId)
        checkVersion(existing.version, input.body.expectedVersion)
        const current = await this.companyRow(tx, input.companyId)
        if (input.body.code) await this.assertUniqueCode(tx, input.body.code, existing.id)
        if (input.body.name)
          await this.assertUniqueSiblingName(tx, {
            parentCompanyId: current.parentCompanyId,
            nameKey: normalizeOrganizationKey(input.body.name),
            excludeCompanyId: current.id,
          })
        const { expectedVersion: _, ...changes } = input.body
        await tx
          .update(companies)
          .set({
            ...changes,
            ...(changes.name ? { nameKey: normalizeOrganizationKey(changes.name) } : {}),
            version: sql`${companies.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, existing.id))
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'company.update',
          objectType: 'company',
          objectId: existing.id,
          summary: { changedFields: Object.keys(changes) },
        })
        return this.company(tx, input.companyId)
      },
    )
  }

  /**
   * 在平台权限下启停公司并递增版本；重新启用时必须确认相关有效作用域仍有管理员。
   *
   * 状态变更与审计记录在同一事务内提交。
   */
  status(input: { actor: AccessActor; companyId: string; body: StatusRequest }) {
    return this.access.write(
      { actor: input.actor, scope: { type: 'platform' }, permission: 'platform.companies.status' },
      /** 根据预期版本启停公司，启用时验证管理员完整性并记录前后状态。 */
      async (tx, access) => {
        const target = await this.company(tx, input.companyId)
        checkVersion(target.version, input.body.expectedVersion)
        await tx
          .update(companies)
          .set({
            status: input.body.status,
            version: sql`${companies.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, target.id))
        if (input.body.status === 'active')
          await this.access.assertAdministrators(tx, { companyId: input.companyId })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'company.status',
          objectType: 'company',
          objectId: target.id,
          summary: { fromStatus: target.status, toStatus: input.body.status },
        })
        return this.company(tx, input.companyId)
      },
    )
  }

  /**
   * 要求平台管理员具备公司管理员设置权限，为目标公司追加或替换管理员并记录审计。
   *
   * @returns 新管理员状态和被替换用户标识。
   */
  setAdministrator(input: {
    actor: AccessActor
    companyId: string
    body: SetAdministratorRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'platform' },
        permission: 'platform.companies.administrator',
        adminOnly: true,
      },
      /** 确认公司存在后变更管理员分配，并返回新管理员状态及替换记录。 */
      async (tx, access): Promise<SetAdministratorResult> => {
        await this.company(tx, input.companyId)
        const scope: AccessScope = { type: 'company', companyId: input.companyId }
        const user = await this.administrators.assign(tx, { scope, body: input.body })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'company.administrator.set',
          objectType: 'company',
          objectId: input.companyId,
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
}
