import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import type {
  AccessScope,
  CreateDictionaryRequest,
  DictionaryListQuery,
  DictionaryOptionsQuery,
  DictionaryRecord,
  UpdateDictionaryRequest,
} from 'shared/types'
import {
  activeDictionaryOptions,
  dictionaryReference,
  preservesDictionaryValues,
} from 'shared/utils'
import { dictionaries, users } from '@/database/schema'
import { AppException } from '@/common/exceptions/app.exception'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import {
  checkVersion,
  pageWindow,
  scopeColumns,
  searchSql,
  toScope,
  type AccessDb,
} from '@/modules/access/access.store'
import { DICTIONARY_ERRORS } from './dictionary.errors'

/** 精确限制字典归属，包含空值列以隔离平台、企业和项目。 */
function filterScope(scope: AccessScope) {
  return and(
    eq(dictionaries.scopeType, scope.type),
    scope.type === 'platform'
      ? isNull(dictionaries.companyId)
      : eq(dictionaries.companyId, scope.companyId),
    scope.type === 'project'
      ? eq(dictionaries.projectId, scope.projectId)
      : isNull(dictionaries.projectId),
  )
}

/** 转换公开字典记录，避免将数据库时间对象泄露到响应边界。 */
function record(row: typeof dictionaries.$inferSelect): DictionaryRecord {
  const { scopeType: _scopeType, companyId: _companyId, projectId: _projectId, ...fields } = row
  return {
    ...fields,
    scope: toScope(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class DictionariesService {
  constructor(private readonly access: AccessService) {}

  /** 同快照分页读取管理数据；业务选项读取不依赖本管理权限。 */
  list(input: { actor: AccessActor; scope: AccessScope; query: DictionaryListQuery }) {
    return this.access.read(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.dictionaries.read`,
      },
      async (tx) => {
        const { page, pageSize, offset } = pageWindow(input.query)
        const condition = and(
          filterScope(input.scope),
          input.query.status ? eq(dictionaries.status, input.query.status) : undefined,
          searchSql([dictionaries.name, dictionaries.code], input.query.query),
        )
        const [total] = await tx.select({ value: count() }).from(dictionaries).where(condition)
        const rows = await tx
          .select()
          .from(dictionaries)
          .where(condition)
          .orderBy(desc(dictionaries.createdAt), dictionaries.id)
          .limit(pageSize)
          .offset(offset)
        return { items: rows.map(record), total: total!.value, page, pageSize }
      },
    )
  }

  /** 在授权事务中创建字典，唯一索引冲突转为稳定业务错误，审计随事务提交。 */
  create(input: { actor: AccessActor; scope: AccessScope; body: CreateDictionaryRequest }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.dictionaries.create`,
        adminOnly: input.scope.type === 'platform',
      },
      async (tx, access) => {
        const [row] = await tx
          .insert(dictionaries)
          .values({ ...scopeColumns(input.scope), ...input.body })
          .onConflictDoNothing()
          .returning()
        if (!row) throw new AppException(DICTIONARY_ERRORS.CODE_EXISTS)
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'dictionary.create',
          objectType: 'dictionary',
          objectId: row.id,
          summary: { code: row.code },
        })
        return record(row)
      },
    )
  }

  /** 限定归属并校验版本及历史值；整体更新与审计原子提交。 */
  update(input: {
    actor: AccessActor
    scope: AccessScope
    dictionaryId: string
    body: UpdateDictionaryRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.dictionaries.update`,
        adminOnly: input.scope.type === 'platform',
      },
      async (tx, access) => {
        const condition = and(filterScope(input.scope), eq(dictionaries.id, input.dictionaryId))
        const [previous] = await tx.select().from(dictionaries).where(condition).for('update')
        if (!previous) throw new AppException(DICTIONARY_ERRORS.NOT_FOUND)
        checkVersion(previous.version, input.body.expectedVersion)
        if (!preservesDictionaryValues({ before: previous.items, after: input.body.items }))
          throw new AppException(DICTIONARY_ERRORS.ITEM_VALUE_IMMUTABLE)
        const { expectedVersion: _version, ...body } = input.body
        const [row] = await tx
          .update(dictionaries)
          .set({
            ...body,
            version: previous.version + 1,
            updatedAt: new Date(),
          })
          .where(condition)
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'dictionary.update',
          objectType: 'dictionary',
          objectId: previous.id,
          summary: { code: previous.code, version: previous.version + 1 },
        })
        return record(row!)
      },
    )
  }

  /** 在已授权的同一数据库快照读取启用字典，不把缺失或停用伪装为空结果。 */
  private async loadOptions(db: AccessDb, query: DictionaryOptionsQuery) {
    const { scope, code } = dictionaryReference(query)
    const [row] = await db
      .select()
      .from(dictionaries)
      .where(
        and(filterScope(scope), eq(dictionaries.code, code), eq(dictionaries.status, 'active')),
      )
    if (!row) throw new AppException(DICTIONARY_ERRORS.NOT_FOUND)
    return activeDictionaryOptions(row.items)
  }

  /** 平台只要求有效登录用户，私有范围要求真实成员资格，不要求配置页权限。 */
  options(input: { actor: AccessActor; query: DictionaryOptionsQuery }) {
    const { scope } = dictionaryReference(input.query)
    if (scope.type !== 'platform')
      return this.access.read({ actor: input.actor, scope }, (tx) =>
        this.loadOptions(tx, input.query),
      )
    return this.access.db.transaction(
      async (tx) => {
        const [user] = await tx
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, input.actor.userId))
        if (!user || user.status !== 'active') throw new AppException(AUTH_ERRORS.SESSION_INVALID)
        return this.loadOptions(tx, input.query)
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
}
