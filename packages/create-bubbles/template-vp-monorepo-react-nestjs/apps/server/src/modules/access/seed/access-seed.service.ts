import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import {
  accessBootstrap,
  auditLogs,
  cleanupTombstones,
  companies,
  menus,
  menuVersions,
  permissions,
  projects,
  rolePermissions,
  roles,
  userRoles,
  users,
} from '@/database/schema'
import { and, eq, sql } from 'drizzle-orm'
import type { AccessScope } from 'shared/types'
import {
  ACCESS_PAGE_CATALOG,
  ACCESS_PERMISSION_CATALOG,
  ACCESS_PROTECTED_ROUTE_KEYS,
  getBuiltinPermissionKeys,
  normalizeAccount,
} from 'shared/utils'
import { AppException } from '@/common/exceptions/app.exception'
import { ACCESS_ERRORS } from '../access.errors'
import { lockAccess, scopeColumns, scopeFilter, type AccessTx } from '../access.store'

@Injectable()
export class AccessSeedService implements OnModuleInit {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
  /** 服务启动时在权限写锁保护下同步权限目录、默认菜单和各作用域内置角色。 */
  async onModuleInit() {
    await this.db.transaction(async (tx) => {
      await lockAccess(tx)
      await this.sync(tx)
    })
  }

  /**
   * 幂等创建作用域内置管理员和普通成员角色，并补齐尚未清理的默认权限。
   *
   * 只追加缺失权限，发生追加时递增角色版本；清理墓碑标记的权限不会恢复。
   * @returns 当前作用域的内置角色记录。
   */
  async ensureRoles(tx: AccessTx, scope: AccessScope) {
    for (const builtin of ['administrator', 'member'] as const) {
      await tx
        .insert(roles)
        .values({
          ...scopeColumns(scope),
          name: builtin === 'administrator' ? '内置管理员' : '内置普通成员',
          builtin,
        })
        .onConflictDoNothing()
    }
    const found = await tx.select().from(roles).where(scopeFilter(scope))
    const tombstones = new Set(
      (await tx.select().from(cleanupTombstones)).map((t) => t.permissionKey),
    )
    for (const role of found.filter((r) => r.builtin)) {
      const keys = getBuiltinPermissionKeys({
        scopeType: scope.type,
        builtin: role.builtin!,
      }).filter((k) => !tombstones.has(k))
      const current = await tx
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id))
      const additions = keys.filter((k) => !current.some((p) => p.permissionKey === k))
      if (additions.length) {
        await tx
          .insert(rolePermissions)
          .values(additions.map((permissionKey) => ({ roleId: role.id, permissionKey })))
          .onConflictDoNothing()
        await tx
          .update(roles)
          .set({ version: sql`${roles.version} + 1`, updatedAt: new Date() })
          .where(eq(roles.id, role.id))
      }
    }
    return found.filter((r) => r.builtin)
  }

  /**
   * 将代码权限目录同步到数据库，补建菜单及各作用域内置角色，同时保留已有菜单配置。
   *
   * 清理墓碑中的权限不会重建；新增菜单时递增对应作用域的菜单版本。
   */
  async sync(tx: AccessTx) {
    const tombstones = new Set(
      (await tx.select().from(cleanupTombstones)).map((t) => t.permissionKey),
    )
    const catalog = ACCESS_PERMISSION_CATALOG.filter((p) => !tombstones.has(p.key))
    for (const scope of ['platform', 'company', 'project'] as const)
      await tx.insert(menuVersions).values({ scopeType: scope }).onConflictDoNothing()
    for (const item of catalog)
      await tx
        .insert(permissions)
        .values(item)
        .onConflictDoUpdate({ target: permissions.key, set: item })
    for (const item of catalog.filter((p) => !p.deprecated)) {
      const [existing] = await tx.select().from(menus).where(eq(menus.permissionKey, item.key))
      if (existing) continue
      const [parent] = item.pagePermissionKey
        ? await tx.select().from(menus).where(eq(menus.permissionKey, item.pagePermissionKey))
        : []
      const defaultIcon =
        item.kind === 'page'
          ? (ACCESS_PAGE_CATALOG.find((page) => page.routeKey === item.routeKey)?.icon ?? '')
          : ''
      await tx.insert(menus).values({
        scopeType: item.scopeType,
        type: item.kind,
        name: item.title,
        routeKey: item.routeKey,
        permissionKey: item.key,
        parentId: parent?.id ?? null,
        icon: defaultIcon,
        protected: (ACCESS_PROTECTED_ROUTE_KEYS as readonly string[]).includes(item.routeKey),
        sort: catalog.indexOf(item),
      })
      await tx
        .update(menuVersions)
        .set({ version: sql`${menuVersions.version} + 1` })
        .where(eq(menuVersions.scopeType, item.scopeType))
    }
    await this.ensureRoles(tx, { type: 'platform' })
    for (const company of await tx.select({ id: companies.id }).from(companies))
      await this.ensureRoles(tx, { type: 'company', companyId: company.id })
    for (const project of await tx
      .select({ id: projects.id, companyId: projects.companyId })
      .from(projects))
      await this.ensureRoles(tx, {
        type: 'project',
        companyId: project.companyId,
        projectId: project.id,
      })
  }

  /**
   * 为有效账号执行首次平台管理员初始化，同步基础权限并写入初始化标记和审计记录。
   *
   * @param account - 待授予首位平台管理员身份的账号，会先进行规范化。
   * @returns 初始化状态；相同账号重复调用可安全返回，其他账号再次初始化会被拒绝。
   */
  async initialize(account: string) {
    return this.db.transaction(async (tx) => {
      await lockAccess(tx)
      const [user] = await tx
        .select()
        .from(users)
        .where(and(eq(users.account, normalizeAccount(account)), eq(users.status, 'active')))
        .for('share')
      if (!user) throw new AppException(ACCESS_ERRORS.INVALID_MEMBER_ACCOUNT)
      const [bootstrap] = await tx.select().from(accessBootstrap)
      if (bootstrap && bootstrap.initializedAdminUserId !== user.id)
        throw new AppException(ACCESS_ERRORS.ALREADY_INITIALIZED)
      await this.sync(tx)
      if (!bootstrap) {
        const [role] = await tx
          .select()
          .from(roles)
          .where(and(scopeFilter({ type: 'platform' }), eq(roles.builtin, 'administrator')))
        await tx.insert(userRoles).values({ userId: user.id, roleId: role!.id })
        await tx.insert(accessBootstrap).values({ id: 1, initializedAdminUserId: user.id })
        await tx.insert(auditLogs).values({
          actorUserId: user.id,
          actorAccount: user.account,
          actorName: user.name,
          scopeType: 'platform',
          action: 'access.initialize',
          objectType: 'platform',
          objectId: 'platform',
          summary: { targetUserId: user.id },
          requestId: crypto.randomUUID(),
        })
      }
      return { initialized: true, account: user.account, alreadyInitialized: !!bootstrap }
    })
  }
}
