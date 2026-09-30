import { Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { menus, menuVersions, rolePermissions } from '@/database/schema'
import type { CreateMenuRequest, MenuTreeResult, ScopeType, UpdateMenuRequest } from 'shared/types'
import {
  ACCESS_CATALOG_VERSION,
  ACCESS_ICON_KEY_PATTERN,
  ACCESS_PAGE_CATALOG,
  ACCESS_PERMISSION_CATALOG,
  ACCESS_PROTECTED_ROUTE_KEYS,
} from 'shared/utils'
import { AppException } from '@/common/exceptions/app.exception'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import { checkVersion, requireFound, type AccessDb } from '@/modules/access/access.store'

type MenuRow = typeof menus.$inferSelect
@Injectable()
export class MenusService {
  constructor(private readonly access: AccessService) {}
  /** 读取指定作用域类型的完整菜单树及版本，供管理端展示和并发修改校验。 */
  async tree(db: AccessDb, scopeType: ScopeType): Promise<MenuTreeResult> {
    const rows = await db.select().from(menus).where(eq(menus.scopeType, scopeType))
    const [version] = await db
      .select()
      .from(menuVersions)
      .where(eq(menuVersions.scopeType, scopeType))
    return { scopeType, version: version?.version ?? 1, items: this.access.tree(rows) }
  }
  /** 校验平台菜单读取权限后，返回指定作用域类型的代码权限目录和目录版本。 */
  catalog(input: { actor: AccessActor; scopeType: ScopeType }) {
    return this.access.read(
      { actor: input.actor, scope: { type: 'platform' }, permission: 'platform.menus.read' },
      async () => ({
        catalogVersion: ACCESS_CATALOG_VERSION,
        items: ACCESS_PERMISSION_CATALOG.filter((p) => p.scopeType === input.scopeType).map(
          (p) => ({ ...p }),
        ),
      }),
    )
  }
  /** 校验平台菜单读取权限后，读取指定作用域类型的完整菜单树。 */
  list(input: { actor: AccessActor; scopeType: ScopeType }) {
    return this.access.read(
      { actor: input.actor, scope: { type: 'platform' }, permission: 'platform.menus.read' },
      (tx) => this.tree(tx, input.scopeType),
    )
  }
  /**
   * 校验菜单父子类型、作用域、权限绑定、图标和无环约束，并保护管理入口及其祖先可见可用。
   *
   * @param rows - 拟保存的完整作用域菜单集合，权限绑定在该集合内必须唯一。
   * @throws 非法结构、重复权限绑定或受保护菜单被隐藏停用时抛出业务异常。
   */
  validate(rows: MenuRow[]) {
    const byId = new Map(rows.map((m) => [m.id, m]))
    for (const row of rows) {
      if (row.icon && !ACCESS_ICON_KEY_PATTERN.test(row.icon))
        throw new AppException(ACCESS_ERRORS.INVALID_MENU_STRUCTURE)
      const parent = row.parentId ? byId.get(row.parentId) : undefined
      if (row.parentId && (!parent || parent.scopeType !== row.scopeType))
        throw new AppException(ACCESS_ERRORS.INVALID_MENU_STRUCTURE)
      if (row.type === 'operation') {
        const permission = ACCESS_PERMISSION_CATALOG.find((p) => p.key === row.permissionKey)
        if (
          !parent ||
          parent.type !== 'page' ||
          parent.permissionKey !== permission?.pagePermissionKey
        )
          throw new AppException(ACCESS_ERRORS.INVALID_MENU_STRUCTURE)
      } else if (parent && parent.type !== 'directory')
        throw new AppException(ACCESS_ERRORS.INVALID_MENU_STRUCTURE)
      const visited = new Set([row.id])
      let ancestor = parent
      while (ancestor) {
        if (visited.has(ancestor.id)) throw new AppException(ACCESS_ERRORS.INVALID_MENU_STRUCTURE)
        visited.add(ancestor.id)
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined
      }
      if (row.protected) {
        let protectedNode: MenuRow | undefined = row
        while (protectedNode) {
          if (protectedNode.status !== 'active' || protectedNode.hidden)
            throw new AppException(ACCESS_ERRORS.PROTECTED_MENU)
          protectedNode = protectedNode.parentId ? byId.get(protectedNode.parentId) : undefined
        }
      }
    }
    const bindings = rows.filter((r) => r.permissionKey).map((r) => r.permissionKey)
    if (new Set(bindings).size !== bindings.length)
      throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
  }
  /**
   * 校验平台菜单创建权限和树版本，将目录、页面或操作绑定到合法权限后加入菜单树。
   *
   * 校验整棵树的结构，写入菜单、递增树版本并记录审计，返回更新后的菜单树。
   */
  create(input: { actor: AccessActor; scopeType: ScopeType; body: CreateMenuRequest }) {
    return this.access.write(
      { actor: input.actor, scope: { type: 'platform' }, permission: 'platform.menus.create' },
      /** 依据当前树版本解析权限绑定并验证新增节点，菜单写入与版本、审计同步提交。 */
      async (tx, access) => {
        const tree = await this.tree(tx, input.scopeType)
        checkVersion(tree.version, input.body.expectedVersion)
        const rows = await tx.select().from(menus).where(eq(menus.scopeType, input.scopeType))
        const body = input.body
        const permission =
          body.type === 'page'
            ? ACCESS_PERMISSION_CATALOG.find(
                (p) =>
                  p.kind === 'page' &&
                  p.routeKey === body.routeKey &&
                  p.scopeType === input.scopeType,
              )
            : body.type === 'operation'
              ? ACCESS_PERMISSION_CATALOG.find(
                  (p) =>
                    p.key === body.permissionKey &&
                    p.kind === 'operation' &&
                    p.scopeType === input.scopeType,
                )
              : undefined
        if (
          (body.type !== 'directory' && (!permission || permission.deprecated)) ||
          (body.type === 'directory' && (body.routeKey || body.permissionKey)) ||
          (body.type === 'page' && body.permissionKey) ||
          (body.type === 'operation' && body.routeKey)
        )
          throw new AppException(ACCESS_ERRORS.INVALID_MENU_STRUCTURE)
        const now = new Date()
        const defaultIcon =
          body.type === 'page'
            ? (ACCESS_PAGE_CATALOG.find((page) => page.routeKey === permission?.routeKey)?.icon ?? '')
            : ''
        const row: MenuRow = {
          id: crypto.randomUUID(),
          scopeType: input.scopeType,
          parentId: body.parentId ?? null,
          type: body.type,
          name: body.name,
          icon: body.icon ?? defaultIcon,
          sort: body.sort ?? 0,
          hidden: body.hidden ?? false,
          status: body.status ?? 'active',
          routeKey: permission?.routeKey ?? null,
          permissionKey: permission?.key ?? null,
          protected: permission
            ? (ACCESS_PROTECTED_ROUTE_KEYS as readonly string[]).includes(permission.routeKey)
            : false,
          createdAt: now,
          updatedAt: now,
        }
        this.validate([...rows, row])
        await tx.insert(menus).values(row)
        await tx
          .update(menuVersions)
          .set({ version: sql`${menuVersions.version} + 1` })
          .where(eq(menuVersions.scopeType, input.scopeType))
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'menu.create',
          objectType: 'menu',
          objectId: row.id,
          summary: { scopeType: input.scopeType },
        })
        return this.tree(tx, input.scopeType)
      },
    )
  }
  /**
   * 按平台菜单操作权限修改或删除节点，校验树版本、结构与受保护入口限制。
   *
   * 删除前要求没有子节点及角色权限引用；成功后递增树版本、记录审计并返回更新后的树。
   */
  change(input: {
    actor: AccessActor
    menuId: string
    body: UpdateMenuRequest | { expectedVersion: number }
    action: 'update' | 'delete'
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: { type: 'platform' },
        permission: `platform.menus.${input.action}`,
      },
      /** 读取锁内最新菜单，验证修改或删除条件后同步更新菜单树版本与审计。 */
      async (tx, access) => {
        const [existing] = await tx.select().from(menus).where(eq(menus.id, input.menuId))
        const row = requireFound(existing)
        checkVersion((await this.tree(tx, row.scopeType)).version, input.body.expectedVersion)
        const rows = await tx.select().from(menus).where(eq(menus.scopeType, row.scopeType))
        if (input.action === 'delete') {
          if (row.protected) throw new AppException(ACCESS_ERRORS.PROTECTED_MENU)
          const references = row.permissionKey
            ? await tx
                .select()
                .from(rolePermissions)
                .where(eq(rolePermissions.permissionKey, row.permissionKey))
            : []
          if (rows.some((r) => r.parentId === row.id) || references.length)
            throw new AppException(ACCESS_ERRORS.RESOURCE_IN_USE)
          await tx.delete(menus).where(eq(menus.id, row.id))
        } else {
          const { expectedVersion: _, ...changes } = input.body as UpdateMenuRequest
          const updated = { ...row, ...changes, updatedAt: new Date() }
          this.validate(rows.map((r) => (r.id === row.id ? updated : r)))
          await tx.update(menus).set(changes).where(eq(menus.id, row.id))
        }
        await tx
          .update(menuVersions)
          .set({ version: sql`${menuVersions.version} + 1` })
          .where(eq(menuVersions.scopeType, row.scopeType))
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: `menu.${input.action}`,
          objectType: 'menu',
          objectId: row.id,
          summary: {
            scopeType: row.scopeType,
            changedFields: Object.keys(input.body).filter((k) => k !== 'expectedVersion'),
          },
        })
        return this.tree(tx, row.scopeType)
      },
    )
  }
}
