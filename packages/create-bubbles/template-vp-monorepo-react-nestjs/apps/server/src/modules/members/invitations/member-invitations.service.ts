import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, gt, lte, sql } from 'drizzle-orm'
import type {
  AcceptCompanyMemberInvitationRequest,
  AcceptCompanyMemberInvitationResult,
  CompanyMemberInvitationIssueResult,
  CompanyMemberInvitationQuery,
  CompanyMemberInvitationRecord,
  CompanyMemberInvitationStatus,
  CreateCompanyMemberInvitationRequest,
  PageResult,
  ResendCompanyMemberInvitationRequest,
  RevokeCompanyMemberInvitationRequest,
} from 'shared/types'
import { AppException } from '@/common/exceptions/app.exception'
import { companies, companyMemberInvitations, companyMembers, users } from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import { checkVersion, lockAccess, pageWindow, type AccessTx } from '@/modules/access/access.store'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { MembersService } from '../members.service'

export const COMPANY_MEMBER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

type CompanyMemberInvitationRow = typeof companyMemberInvitations.$inferSelect
type CompanyScope = { type: 'company'; companyId: string }

@Injectable()
export class MemberInvitationsService {
  constructor(
    private readonly access: AccessService,
    private readonly members: MembersService,
  ) {}

  /** 生成具有足够熵且适合放入 URL 的一次性邀请 token。 */
  private createToken() {
    return randomBytes(32).toString('base64url')
  }

  /** 使用 SHA-256 生成固定长度摘要，数据库和审计中均不保存原始 token。 */
  private digestToken(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex')
  }

  /** 将数据库状态和过期时间转换为公开状态；过期状态无需后台任务写回。 */
  private toRecord(
    row: CompanyMemberInvitationRow,
    now = new Date(),
  ): CompanyMemberInvitationRecord {
    const status: CompanyMemberInvitationStatus =
      row.status === 'pending' && row.expiresAt.getTime() <= now.getTime() ? 'expired' : row.status
    return {
      id: row.id,
      companyId: row.companyId,
      status,
      createdByUserId: row.createdByUserId,
      acceptedByUserId: row.acceptedByUserId,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** 根据公开邀请状态构造数据库筛选条件，其中 expired 映射为已过期的 pending 记录。 */
  private statusCondition(status: CompanyMemberInvitationStatus | undefined, now: Date) {
    if (status === 'pending')
      return and(
        eq(companyMemberInvitations.status, 'pending'),
        gt(companyMemberInvitations.expiresAt, now),
      )
    if (status === 'expired')
      return and(
        eq(companyMemberInvitations.status, 'pending'),
        lte(companyMemberInvitations.expiresAt, now),
      )
    return status ? eq(companyMemberInvitations.status, status) : undefined
  }

  /** 在当前企业内读取邀请，避免通过其他企业的 invitationId 探测资源。 */
  private async invitationById(tx: AccessTx, input: { companyId: string; invitationId: string }) {
    const [invitation] = await tx
      .select()
      .from(companyMemberInvitations)
      .where(
        and(
          eq(companyMemberInvitations.companyId, input.companyId),
          eq(companyMemberInvitations.id, input.invitationId),
        ),
      )
    if (!invitation) throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_NOT_FOUND)
    return invitation
  }

  /** 按企业分页列出邀请状态，响应永远不包含 token 或 token 摘要。 */
  list(input: {
    actor: AccessActor
    scope: CompanyScope
    query: CompanyMemberInvitationQuery
  }): Promise<PageResult<CompanyMemberInvitationRecord>> {
    return this.access.read(
      { ...input, permission: 'company.members.add' },
      /** 在同一读取快照内完成状态筛选、计数和分页。 */
      async (tx) => {
        const now = new Date()
        const { page, pageSize, offset } = pageWindow(input.query)
        const condition = and(
          eq(companyMemberInvitations.companyId, input.scope.companyId),
          this.statusCondition(input.query.status, now),
        )
        const [total] = await tx
          .select({ value: count() })
          .from(companyMemberInvitations)
          .where(condition)
        const rows = await tx
          .select()
          .from(companyMemberInvitations)
          .where(condition)
          .orderBy(desc(companyMemberInvitations.createdAt), desc(companyMemberInvitations.id))
          .limit(pageSize)
          .offset(offset)
        return {
          page,
          pageSize,
          total: total!.value,
          items: rows.map((row) => this.toRecord(row, now)),
        }
      },
    )
  }

  /** 创建 7 天有效的邀请并仅在本次响应返回原始 token。 */
  create(input: {
    actor: AccessActor
    scope: CompanyScope
    body: CreateCompanyMemberInvitationRequest
  }): Promise<CompanyMemberInvitationIssueResult> {
    return this.access.write(
      { ...input, permission: 'company.members.add' },
      /** 邀请落库与创建审计同事务提交。 */
      async (tx, access) => {
        const token = this.createToken()
        const now = new Date()
        const expiresAt = new Date(now.getTime() + COMPANY_MEMBER_INVITATION_TTL_MS)
        const [created] = await tx
          .insert(companyMemberInvitations)
          .values({
            companyId: input.scope.companyId,
            tokenDigest: this.digestToken(token),
            createdByUserId: access.user.id,
            expiresAt,
          })
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'member.invitation.create',
          objectType: 'memberInvitation',
          objectId: created!.id,
          summary: { expiresAt: expiresAt.toISOString() },
        })
        return { invitation: this.toRecord(created!, now), token }
      },
    )
  }

  /** 撤销未被接受的邀请；重复撤销直接返回当前记录且不重复写审计。 */
  revoke(input: {
    actor: AccessActor
    scope: CompanyScope
    invitationId: string
    body: RevokeCompanyMemberInvitationRequest
  }): Promise<CompanyMemberInvitationRecord> {
    return this.access.write(
      { ...input, permission: 'company.members.add' },
      /** 在版本校验后原子更新状态并记录撤销审计。 */
      async (tx, access) => {
        const invitation = await this.invitationById(tx, {
          companyId: input.scope.companyId,
          invitationId: input.invitationId,
        })
        if (invitation.status === 'revoked') return this.toRecord(invitation)
        if (invitation.status !== 'pending')
          throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_NOT_PENDING)
        checkVersion(invitation.version, input.body.expectedVersion)
        const now = new Date()
        const [updated] = await tx
          .update(companyMemberInvitations)
          .set({
            status: 'revoked',
            revokedAt: now,
            version: sql`${companyMemberInvitations.version} + 1`,
            updatedAt: now,
          })
          .where(eq(companyMemberInvitations.id, invitation.id))
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'member.invitation.revoke',
          objectType: 'memberInvitation',
          objectId: invitation.id,
          summary: { previousStatus: this.toRecord(invitation, now).status },
        })
        return this.toRecord(updated!, now)
      },
    )
  }

  /** 轮换待处理或已过期邀请的 token 并重新计算 7 天有效期，旧 token 立即失效。 */
  resend(input: {
    actor: AccessActor
    scope: CompanyScope
    invitationId: string
    body: ResendCompanyMemberInvitationRequest
  }): Promise<CompanyMemberInvitationIssueResult> {
    return this.access.write(
      { ...input, permission: 'company.members.add' },
      /** 版本校验、token 轮换和审计在同一管理事务内提交。 */
      async (tx, access) => {
        const invitation = await this.invitationById(tx, {
          companyId: input.scope.companyId,
          invitationId: input.invitationId,
        })
        if (invitation.status !== 'pending')
          throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_NOT_PENDING)
        checkVersion(invitation.version, input.body.expectedVersion)
        const token = this.createToken()
        const now = new Date()
        const expiresAt = new Date(now.getTime() + COMPANY_MEMBER_INVITATION_TTL_MS)
        const [updated] = await tx
          .update(companyMemberInvitations)
          .set({
            tokenDigest: this.digestToken(token),
            expiresAt,
            version: sql`${companyMemberInvitations.version} + 1`,
            updatedAt: now,
          })
          .where(eq(companyMemberInvitations.id, invitation.id))
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'member.invitation.resend',
          objectType: 'memberInvitation',
          objectId: invitation.id,
          summary: {
            previousExpiresAt: invitation.expiresAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        })
        return { invitation: this.toRecord(updated!, now), token }
      },
    )
  }

  /**
   * 登录用户使用一次性 token 接受邀请；成员、默认角色、邀请消费状态和审计原子提交。
   *
   * 同一用户重复提交已消费 token 时返回原结果；其他用户复用、已有成员、过期或撤销均返回明确冲突。
   */
  accept(input: {
    actor: AccessActor
    body: AcceptCompanyMemberInvitationRequest
  }): Promise<AcceptCompanyMemberInvitationResult> {
    const tokenDigest = this.digestToken(input.body.token)
    return this.access.db.transaction(async (tx) => {
      await lockAccess(tx)
      const [actorUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.actor.userId), eq(users.status, 'active')))
      if (!actorUser) throw new AppException(AUTH_ERRORS.SESSION_INVALID)
      const [found] = await tx
        .select({ invitation: companyMemberInvitations, company: companies })
        .from(companyMemberInvitations)
        .innerJoin(companies, eq(companies.id, companyMemberInvitations.companyId))
        .where(eq(companyMemberInvitations.tokenDigest, tokenDigest))
      if (!found) throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_NOT_FOUND)
      const { invitation, company } = found
      const scope: CompanyScope = { type: 'company', companyId: company.id }
      if (invitation.status === 'accepted') {
        if (invitation.acceptedByUserId !== actorUser.id)
          throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_ALREADY_ACCEPTED)
        const [existingMember] = await tx
          .select({ id: companyMembers.id })
          .from(companyMembers)
          .where(
            and(eq(companyMembers.companyId, company.id), eq(companyMembers.userId, actorUser.id)),
          )
        if (!existingMember)
          throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_ALREADY_ACCEPTED)
        return {
          invitationId: invitation.id,
          companyId: company.id,
          companyName: company.name,
          member: await this.members.record(tx, scope, existingMember.id),
        }
      }
      if (invitation.status === 'revoked')
        throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_REVOKED)
      const now = new Date()
      if (invitation.expiresAt.getTime() <= now.getTime())
        throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_EXPIRED)
      if (company.status !== 'active') throw new AppException(ACCESS_ERRORS.FORBIDDEN)
      const [existingMember] = await tx
        .select({ id: companyMembers.id })
        .from(companyMembers)
        .where(
          and(eq(companyMembers.companyId, company.id), eq(companyMembers.userId, actorUser.id)),
        )
      if (existingMember) throw new AppException(ACCESS_ERRORS.MEMBER_INVITATION_MEMBER_EXISTS)
      const memberId = await this.members.ensureMember(tx, scope, actorUser.id)
      await tx
        .update(companyMemberInvitations)
        .set({
          status: 'accepted',
          acceptedByUserId: actorUser.id,
          acceptedAt: now,
          version: sql`${companyMemberInvitations.version} + 1`,
          updatedAt: now,
        })
        .where(eq(companyMemberInvitations.id, invitation.id))
      const verified = await this.access.authorize(tx, { actor: input.actor, scope })
      await this.access.audit(tx, {
        actor: input.actor,
        access: verified,
        action: 'member.invitation.accept',
        objectType: 'memberInvitation',
        objectId: invitation.id,
        summary: { targetUserId: actorUser.id, memberId },
      })
      return {
        invitationId: invitation.id,
        companyId: company.id,
        companyName: company.name,
        member: await this.members.record(tx, scope, memberId),
      }
    })
  }
}
