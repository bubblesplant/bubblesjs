import { Injectable } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { roles, userRoles, users } from '@/database/schema'
import { AppException } from '@/common/exceptions/app.exception'
import { AccessService } from '@/modules/access/access.service'
import { AccessSeedService } from '@/modules/access/seed/access-seed.service'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import {
  requireFound,
  scopeFilter,
  type AccessDb,
  type AccessTx,
} from '@/modules/access/access.store'
import { MembersService } from '@/modules/members/members.service'
import type { AccessScope, AdministratorSummary, SetAdministratorRequest } from 'shared/types'

@Injectable()
export class AdministratorsService {
  constructor(
    private readonly access: AccessService,
    private readonly members: MembersService,
    private readonly seed: AccessSeedService,
  ) {}

  /**
   * 列出公司或项目直接分配的管理员，附带账号状态、成员状态和当前身份是否有效。
   *
   * 没有对应成员关系的角色分配会被忽略，继承的公司管理员不在项目直接分配列表中。
   */
  async administrators(db: AccessDb, scope: AccessScope): Promise<AdministratorSummary[]> {
    const assignments = await db
      .select({
        user: { id: users.id, name: users.name, account: users.account, status: users.status },
      })
      .from(roles)
      .innerJoin(userRoles, eq(userRoles.roleId, roles.id))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(scopeFilter(scope), eq(roles.builtin, 'administrator')))
    const result: AdministratorSummary[] = []
    for (const { user } of assignments) {
      const table = this.members.table(scope)
      const [member] = await db
        .select()
        .from(table)
        .where(and(this.members.filter(scope), eq(table.userId, user.id)))
      if (!member) continue
      result.push({
        id: user.id,
        name: user.name,
        account: user.account,
        accountStatus: user.status,
        memberStatus: member.status,
        effective: await this.access.isAdministrator(db, scope, user.id),
      })
    }
    return result
  }

  /** 在现有事务中补齐内置角色和有效成员关系，并幂等授予指定用户管理员角色。 */
  async initialize(tx: AccessTx, scope: AccessScope, userId: string) {
    const builtins = await this.seed.ensureRoles(tx, scope)
    await this.members.ensureMember(tx, scope, userId)
    await tx
      .insert(userRoles)
      .values({
        userId,
        roleId: builtins.find((role) => role.builtin === 'administrator')!.id,
      })
      .onConflictDoNothing()
  }

  /**
   * 验证新管理员 userId 并保证成员关系有效，授予管理员角色后按需撤销旧管理员角色。
   *
   * 新旧成员版本都会递增；调用方负责作用域鉴权、审计记录及事务提交。
   * @returns 新管理员对应的用户记录。
   */
  async assign(tx: AccessTx, input: { scope: AccessScope; body: SetAdministratorRequest }) {
    const { scope, body } = input
    const user = await this.members.userForAdministrator(tx, {
      userId: body.administratorUserId,
      companyId: scope.type === 'project' ? scope.companyId : undefined,
    })
    const builtins = await this.seed.ensureRoles(tx, scope)
    const role = builtins.find((item) => item.builtin === 'administrator')!
    if (body.replaceUserId) {
      if (user.id === body.replaceUserId)
        throw new AppException(ACCESS_ERRORS.INVALID_MEMBER_RELATION)
      const [old] = await tx
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.roleId, role.id), eq(userRoles.userId, body.replaceUserId)))
      requireFound(old)
    }
    await this.members.ensureMember(tx, scope, user.id)
    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing()
    if (body.replaceUserId)
      await tx
        .delete(userRoles)
        .where(and(eq(userRoles.userId, body.replaceUserId), eq(userRoles.roleId, role.id)))
    const memberTable = this.members.table(scope)
    await tx
      .update(memberTable)
      .set({ version: sql`${memberTable.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          this.members.filter(scope),
          inArray(memberTable.userId, [
            user.id,
            ...(body.replaceUserId ? [body.replaceUserId] : []),
          ]),
        ),
      )
    return user
  }
}
