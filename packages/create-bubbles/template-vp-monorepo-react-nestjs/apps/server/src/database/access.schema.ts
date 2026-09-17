import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './schema'

export const accessStatus = pgEnum('access_status', ['active', 'disabled'])
export const scopeType = pgEnum('access_scope_type', ['platform', 'company', 'project'])
export const menuType = pgEnum('menu_type', ['directory', 'page', 'operation'])
export const builtinRole = pgEnum('builtin_role', ['administrator', 'member'])
export const companyEntityType = pgEnum('company_entity_type', ['group', 'company'])
export const companyMemberInvitationStatus = pgEnum('company_member_invitation_status', [
  'pending',
  'accepted',
  'revoked',
])
/**
 * 为每张权限业务表创建独立的创建时间与更新时间列定义，并由数据库提供默认当前时间。
 */
const times = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentCompanyId: uuid('parent_company_id'),
    entityType: companyEntityType('entity_type').notNull().default('company'),
    name: varchar('name', { length: 100 }).notNull(),
    nameKey: text('name_key').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    description: text('description').notNull().default(''),
    sort: integer('sort').notNull().default(1),
    status: accessStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...times(),
  },
  /**
   * 约束企业层级、规范化名称、编码唯一性、排序及版本号。
   */
  (t) => [
    foreignKey({ columns: [t.parentCompanyId], foreignColumns: [t.id] }).onDelete('restrict'),
    uniqueIndex('companies_root_name_key_uq')
      .on(t.nameKey)
      .where(sql`${t.parentCompanyId} IS NULL`),
    uniqueIndex('companies_parent_name_key_uq')
      .on(t.parentCompanyId, t.nameKey)
      .where(sql`${t.parentCompanyId} IS NOT NULL`),
    uniqueIndex('companies_code_normalized_uq').on(sql`lower(normalize(btrim(${t.code}), NFKC))`),
    check(
      'companies_name_key_normalized',
      sql`${t.nameKey} = lower(normalize(btrim(${t.name}), NFKC))`,
    ),
    check('companies_sort_range', sql`${t.sort} BETWEEN 0 AND 999999999`),
    check('companies_version_positive', sql`${t.version} > 0`),
  ],
)
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    description: text('description').notNull().default(''),
    status: accessStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...times(),
  },
  /**
   * 约束公司内项目编码唯一及版本有效，并为公司下的项目状态查询建立索引。
   */
  (t) => [
    uniqueIndex('projects_company_code_normalized_uq').on(
      t.companyId,
      sql`lower(normalize(btrim(${t.code}), NFKC))`,
    ),
    unique('projects_company_id_uq').on(t.companyId, t.id),
    check('projects_version_positive', sql`${t.version} > 0`),
    index('projects_company_status_idx').on(t.companyId, t.status),
  ],
)
export const companyMembers = pgTable(
  'company_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: accessStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...times(),
  },
  /**
   * 约束公司成员关系唯一及版本有效，并为按用户查找成员关系建立索引。
   */
  (t) => [
    unique('company_members_company_user_uq').on(t.companyId, t.userId),
    check('company_members_version_positive', sql`${t.version} > 0`),
    index('company_members_user_idx').on(t.userId),
  ],
)
export const companyMemberInvitations = pgTable(
  'company_member_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    tokenDigest: varchar('token_digest', { length: 64 }).notNull(),
    status: companyMemberInvitationStatus('status').notNull().default('pending'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...times(),
  },
  /**
   * 保证邀请 token 摘要全局唯一、状态时间字段一致，并优化企业邀请列表和过期判断。
   */
  (t) => [
    uniqueIndex('company_member_invitations_token_digest_uq').on(t.tokenDigest),
    index('company_member_invitations_company_status_created_idx').on(
      t.companyId,
      t.status,
      t.createdAt,
      t.id,
    ),
    index('company_member_invitations_pending_expires_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      'company_member_invitations_token_digest_length',
      sql`char_length(${t.tokenDigest}) = 64`,
    ),
    check('company_member_invitations_version_positive', sql`${t.version} > 0`),
    check(
      'company_member_invitations_state_check',
      sql`(${t.status} = 'pending' AND ${t.acceptedByUserId} IS NULL AND ${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL) OR (${t.status} = 'accepted' AND ${t.acceptedByUserId} IS NOT NULL AND ${t.acceptedAt} IS NOT NULL AND ${t.revokedAt} IS NULL) OR (${t.status} = 'revoked' AND ${t.acceptedByUserId} IS NULL AND ${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NOT NULL)`,
    ),
  ],
)
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id').notNull(),
    status: accessStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    ...times(),
  },
  /**
   * 通过组合外键确保项目与成员归属同一公司，并约束项目成员唯一及版本有效。
   */
  (t) => [
    unique('project_members_project_user_uq').on(t.projectId, t.userId),
    foreignKey({
      columns: [t.companyId, t.projectId],
      foreignColumns: [projects.companyId, projects.id],
    }),
    foreignKey({
      columns: [t.companyId, t.userId],
      foreignColumns: [companyMembers.companyId, companyMembers.userId],
    }),
    check('project_members_version_positive', sql`${t.version} > 0`),
    index('project_members_user_idx').on(t.userId),
  ],
)
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull(),
    companyId: uuid('company_id').references(() => companies.id),
    projectId: uuid('project_id').references(() => projects.id),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description').notNull().default(''),
    builtin: builtinRole('builtin'),
    version: integer('version').notNull().default(1),
    ...times(),
  },
  /**
   * 约束角色作用域与所属资源一致，并按作用域保证角色名称及内置角色唯一。
   */
  (t) => [
    check(
      'roles_scope_check',
      sql`(${t.scopeType} = 'platform' AND ${t.companyId} IS NULL AND ${t.projectId} IS NULL) OR (${t.scopeType} = 'company' AND ${t.companyId} IS NOT NULL AND ${t.projectId} IS NULL) OR (${t.scopeType} = 'project' AND ${t.companyId} IS NOT NULL AND ${t.projectId} IS NOT NULL)`,
    ),
    foreignKey({
      columns: [t.companyId, t.projectId],
      foreignColumns: [projects.companyId, projects.id],
    }),
    uniqueIndex('roles_platform_name_uq')
      .on(t.name)
      .where(sql`${t.scopeType} = 'platform'`),
    uniqueIndex('roles_company_name_uq')
      .on(t.companyId, t.name)
      .where(sql`${t.scopeType} = 'company'`),
    uniqueIndex('roles_project_name_uq')
      .on(t.projectId, t.name)
      .where(sql`${t.scopeType} = 'project'`),
    uniqueIndex('roles_platform_builtin_uq')
      .on(t.builtin)
      .where(sql`${t.scopeType} = 'platform' AND ${t.builtin} IS NOT NULL`),
    uniqueIndex('roles_company_builtin_uq')
      .on(t.companyId, t.builtin)
      .where(sql`${t.scopeType} = 'company' AND ${t.builtin} IS NOT NULL`),
    uniqueIndex('roles_project_builtin_uq')
      .on(t.projectId, t.builtin)
      .where(sql`${t.scopeType} = 'project' AND ${t.builtin} IS NOT NULL`),
    check('roles_version_positive', sql`${t.version} > 0`),
  ],
)
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  /**
   * 以用户和角色组成联合主键，避免重复授权，并为角色成员查询建立索引。
   */
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
)
export const permissions = pgTable(
  'permissions',
  {
    key: varchar('key', { length: 150 }).primaryKey(),
    scopeType: scopeType('scope_type').notNull(),
    title: varchar('title', { length: 100 }).notNull(),
    routeKey: varchar('route_key', { length: 120 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(),
    pagePermissionKey: varchar('page_permission_key', { length: 150 }),
    adminOnly: boolean('admin_only').notNull().default(false),
    deprecated: boolean('deprecated').notNull().default(false),
  },
  /**
   * 约束操作权限必须引用同作用域的页面权限，页面权限不能再引用父页面。
   */
  (t) => [
    unique('permissions_scope_key_uq').on(t.scopeType, t.key),
    foreignKey({
      columns: [t.scopeType, t.pagePermissionKey],
      foreignColumns: [t.scopeType, t.key],
    }),
    check(
      'permissions_kind_check',
      sql`(${t.kind} = 'page' AND ${t.pagePermissionKey} IS NULL) OR (${t.kind} = 'operation' AND ${t.pagePermissionKey} IS NOT NULL AND ${t.pagePermissionKey} <> ${t.key})`,
    ),
  ],
)
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 150 })
      .notNull()
      .references(() => permissions.key),
  },
  /**
   * 以角色和权限组成联合主键，避免重复授权，并为权限反查角色建立索引。
   */
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionKey] }),
    index('role_permissions_key_idx').on(t.permissionKey),
  ],
)
export const menus = pgTable(
  'menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull(),
    parentId: uuid('parent_id'),
    type: menuType('type').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    icon: varchar('icon', { length: 80 }).notNull().default(''),
    sort: integer('sort').notNull().default(0),
    hidden: boolean('hidden').notNull().default(false),
    status: accessStatus('status').notNull().default('active'),
    routeKey: varchar('route_key', { length: 120 }),
    permissionKey: varchar('permission_key', { length: 150 }).references(() => permissions.key),
    protected: boolean('protected').notNull().default(false),
    ...times(),
  },
  /**
   * 约束菜单父子关系及作用域内页面、权限唯一，并优化菜单树查询。
   */
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }),
    unique('menus_permission_uq').on(t.scopeType, t.permissionKey),
    uniqueIndex('menus_page_uq')
      .on(t.scopeType, t.routeKey)
      .where(sql`${t.type} = 'page'`),
    index('menus_scope_parent_idx').on(t.scopeType, t.parentId),
  ],
)
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    actorAccount: varchar('actor_account', { length: 32 }).notNull(),
    actorName: varchar('actor_name', { length: 100 }).notNull(),
    scopeType: scopeType('scope_type').notNull(),
    companyId: uuid('company_id'),
    projectId: uuid('project_id'),
    action: varchar('action', { length: 120 }).notNull(),
    objectType: varchar('object_type', { length: 60 }).notNull(),
    objectId: text('object_id').notNull(),
    summary: jsonb('summary')
      .$type<Record<string, string | number | boolean | null | string[]>>()
      .notNull(),
    requestId: varchar('request_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /**
   * 约束审计范围与公司、项目归属一致，并优化范围内按时间和 ID 查询日志。
   */
  (t) => [
    check(
      'audit_scope_check',
      sql`(${t.scopeType} = 'platform' AND ${t.companyId} IS NULL AND ${t.projectId} IS NULL) OR (${t.scopeType} = 'company' AND ${t.companyId} IS NOT NULL AND ${t.projectId} IS NULL) OR (${t.scopeType} = 'project' AND ${t.companyId} IS NOT NULL AND ${t.projectId} IS NOT NULL)`,
    ),
    index('audit_scope_created_idx').on(t.scopeType, t.companyId, t.projectId, t.createdAt, t.id),
  ],
)
export const menuVersions = pgTable(
  'menu_versions',
  {
    scopeType: scopeType('scope_type').primaryKey(),
    version: integer('version').notNull().default(1),
  },
  /**
   * 确保每个作用域的菜单版本号始终为正数。
   */
  (t) => [check('menu_versions_positive', sql`${t.version} > 0`)],
)
export const cleanupTombstones = pgTable('permission_cleanup_tombstones', {
  permissionKey: varchar('permission_key', { length: 150 }).primaryKey(),
  cleanedAt: timestamp('cleaned_at', { withTimezone: true }).defaultNow().notNull(),
  deploymentId: text('deployment_id').notNull(),
})
export const accessBootstrap = pgTable(
  'access_bootstrap',
  {
    id: integer('id').primaryKey(),
    initializedAdminUserId: uuid('initialized_admin_user_id')
      .notNull()
      .references(() => users.id),
    initializedAt: timestamp('initialized_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /**
   * 将初始化状态限制为 ID 为 1 的单例记录，避免重复保存引导状态。
   */
  (t) => [check('access_bootstrap_singleton', sql`${t.id} = 1`)],
)
