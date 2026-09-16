import { Injectable } from '@nestjs/common'
import { asc, count, inArray, sql } from 'drizzle-orm'
import { users } from '@/database/schema'
import {
  AccessService,
  type AccessActor,
  type AccessRequirement,
} from '@/modules/access/access.service'
import { pageWindow, searchSql } from '@/modules/access/access.store'
import type {
  GlobalAccountCandidate,
  GlobalAccountCandidatePurpose,
  GlobalAccountCandidateQuery,
  PageResult,
  ResolveGlobalAccountCandidatesRequest,
} from 'shared/types'

@Injectable()
export class GlobalAccountCandidatesService {
  constructor(private readonly access: AccessService) {}

  /** 根据平台账号候选用途映射固定权限，禁止客户端直接指定权限键。 */
  private requirement(
    actor: AccessActor,
    purpose: GlobalAccountCandidatePurpose,
  ): AccessRequirement {
    return {
      actor,
      scope: { type: 'platform' },
      permission:
        purpose === 'createCompanyAdministrator'
          ? 'platform.companies.create'
          : 'platform.companies.administrator',
      adminOnly: true,
    }
  }

  /** 将账号数据库行转换为全局候选，并为不可用账号附加稳定禁选原因。 */
  private candidate(
    row: Pick<typeof users.$inferSelect, 'id' | 'account' | 'name' | 'status'>,
  ): GlobalAccountCandidate {
    const disabled = row.status !== 'active'
    return {
      userId: row.id,
      account: row.account,
      name: row.name,
      status: row.status,
      disabled,
      disabledReason: disabled ? 'accountInactive' : null,
    }
  }

  /** 按用途鉴权后，以姓名或完整账号执行服务端分页搜索。 */
  search(input: {
    actor: AccessActor
    query: GlobalAccountCandidateQuery
  }): Promise<PageResult<GlobalAccountCandidate>> {
    return this.access.read(this.requirement(input.actor, input.query.purpose), async (tx) => {
      const { page, pageSize, offset } = pageWindow(input.query)
      const condition = searchSql([users.name, users.account], input.query.query)
      const [total] = await tx.select({ value: count() }).from(users).where(condition)
      const rows = await tx
        .select({
          id: users.id,
          account: users.account,
          name: users.name,
          status: users.status,
        })
        .from(users)
        .where(condition)
        .orderBy(
          asc(sql<string>`lower(normalize(btrim(${users.name}), NFKC))`),
          asc(users.account),
          asc(users.id),
        )
        .limit(pageSize)
        .offset(offset)
      return {
        items: rows.map((row) => this.candidate(row)),
        total: total!.value,
        page,
        pageSize,
      }
    })
  }

  /** 按请求 userId 顺序回显已知账号；未知 ID 不返回占位，停用账号仍稳定回显。 */
  resolve(input: {
    actor: AccessActor
    body: ResolveGlobalAccountCandidatesRequest
  }): Promise<GlobalAccountCandidate[]> {
    return this.access.read(this.requirement(input.actor, input.body.purpose), async (tx) => {
      const rows = await tx
        .select({
          id: users.id,
          account: users.account,
          name: users.name,
          status: users.status,
        })
        .from(users)
        .where(inArray(users.id, input.body.userIds))
      const byUserId = new Map(rows.map((row) => [row.id, this.candidate(row)]))
      return input.body.userIds.flatMap((userId) => {
        const candidate = byUserId.get(userId)
        return candidate ? [candidate] : []
      })
    })
  }
}
