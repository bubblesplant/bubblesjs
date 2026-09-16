import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  accessStatus,
  companies,
  companyMembers,
  projects,
  projectMembers,
  scopeType,
} from './access.schema'

export const organizationDuty = pgEnum('organization_duty', ['member', 'leader', 'deputy'])

/** 为组织领域稳定资源补齐统一的创建和更新时间。 */
const organizationTimes = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const organizationTrees = pgTable(
  'organization_trees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id'),
    backfillBatchKey: varchar('backfill_batch_key', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /** 每个企业或项目只能有一棵树，并用组合键承载关系表的租户完整性约束。 */
  (t) => [
    foreignKey({ columns: [t.companyId], foreignColumns: [companies.id] }).onDelete('restrict'),
    foreignKey({
      columns: [t.companyId, t.projectId],
      foreignColumns: [projects.companyId, projects.id],
    }).onDelete('restrict'),
    check(
      'organization_trees_scope_check',
      sql`(${t.scopeType} = 'company' AND ${t.projectId} IS NULL) OR (${t.scopeType} = 'project' AND ${t.projectId} IS NOT NULL)`,
    ),
    unique('organization_trees_company_ref_uq').on(t.id, t.scopeType, t.companyId),
    unique('organization_trees_project_ref_uq').on(t.id, t.scopeType, t.companyId, t.projectId),
    uniqueIndex('organization_trees_company_scope_uq')
      .on(t.companyId)
      .where(sql`${t.scopeType} = 'company'`),
    uniqueIndex('organization_trees_project_scope_uq')
      .on(t.projectId)
      .where(sql`${t.scopeType} = 'project'`),
  ],
)

export const organizationUnits = pgTable(
  'organization_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    treeId: uuid('tree_id')
      .notNull()
      .references(() => organizationTrees.id, { onDelete: 'restrict' }),
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 100 }).notNull(),
    nameKey: text('name_key').notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    codeKey: varchar('code_key', { length: 32 }).notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    sort: integer('sort').notNull(),
    status: accessStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    sourceTemplateUnitId: uuid('source_template_unit_id'),
    ...organizationTimes(),
  },
  /** 组织单元在单树内保持编码唯一、同父名称唯一，并禁止跨树父子关系。 */
  (t) => [
    unique('organization_units_tree_id_uq').on(t.treeId, t.id),
    foreignKey({ columns: [t.treeId, t.parentId], foreignColumns: [t.treeId, t.id] }).onDelete(
      'restrict',
    ),
    foreignKey({
      columns: [t.sourceTemplateUnitId],
      foreignColumns: [organizationTemplateUnits.id],
    }).onDelete('restrict'),
    uniqueIndex('organization_units_tree_code_key_uq').on(t.treeId, t.codeKey),
    uniqueIndex('organization_units_root_name_key_uq')
      .on(t.treeId, t.nameKey)
      .where(sql`${t.parentId} IS NULL`),
    uniqueIndex('organization_units_parent_name_key_uq')
      .on(t.treeId, t.parentId, t.nameKey)
      .where(sql`${t.parentId} IS NOT NULL`),
    check('organization_units_name_length', sql`char_length(${t.name}) BETWEEN 2 AND 100`),
    check(
      'organization_units_name_key_normalized',
      sql`${t.nameKey} = lower(normalize(btrim(${t.name}), NFKC))`,
    ),
    check(
      'organization_units_code_check',
      sql`char_length(${t.code}) BETWEEN 2 AND 32 AND ${t.code} ~ '^[a-z0-9_-]+$'`,
    ),
    check(
      'organization_units_code_key_normalized',
      sql`${t.codeKey} = lower(normalize(btrim(${t.code}), NFKC))`,
    ),
    check('organization_units_sort_range', sql`${t.sort} BETWEEN 0 AND 999999999`),
    check('organization_units_version_positive', sql`${t.version} > 0`),
    index('organization_units_tree_parent_sort_idx').on(t.treeId, t.parentId, t.sort, t.id),
  ],
)

export const companyOrganizationUnitMembers = pgTable(
  'company_organization_unit_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull().default('company'),
    companyId: uuid('company_id').notNull(),
    treeId: uuid('tree_id').notNull(),
    organizationUnitId: uuid('organization_unit_id').notNull(),
    userId: uuid('user_id').notNull(),
    duty: organizationDuty('duty').notNull().default('member'),
    ...organizationTimes(),
  },
  /** 使用复制的企业作用域键阻止组织单元与成员跨企业组合。 */
  (t) => [
    check('company_organization_members_scope_check', sql`${t.scopeType} = 'company'`),
    foreignKey({
      columns: [t.treeId, t.scopeType, t.companyId],
      foreignColumns: [
        organizationTrees.id,
        organizationTrees.scopeType,
        organizationTrees.companyId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.treeId, t.organizationUnitId],
      foreignColumns: [organizationUnits.treeId, organizationUnits.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.companyId, t.userId],
      foreignColumns: [companyMembers.companyId, companyMembers.userId],
    }).onDelete('cascade'),
    unique('company_organization_members_member_unit_uq').on(t.userId, t.organizationUnitId),
    uniqueIndex('company_organization_members_leader_uq')
      .on(t.organizationUnitId)
      .where(sql`${t.duty} = 'leader'`),
    index('company_organization_members_user_idx').on(t.companyId, t.userId),
  ],
)

export const projectOrganizationUnitMembers = pgTable(
  'project_organization_unit_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull().default('project'),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    treeId: uuid('tree_id').notNull(),
    organizationUnitId: uuid('organization_unit_id').notNull(),
    userId: uuid('user_id').notNull(),
    duty: organizationDuty('duty').notNull().default('member'),
    ...organizationTimes(),
  },
  /** 使用完整项目作用域键阻止组织单元与成员跨项目组合。 */
  (t) => [
    check('project_organization_members_scope_check', sql`${t.scopeType} = 'project'`),
    foreignKey({
      columns: [t.treeId, t.scopeType, t.companyId, t.projectId],
      foreignColumns: [
        organizationTrees.id,
        organizationTrees.scopeType,
        organizationTrees.companyId,
        organizationTrees.projectId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.treeId, t.organizationUnitId],
      foreignColumns: [organizationUnits.treeId, organizationUnits.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.projectId, t.userId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }).onDelete('cascade'),
    unique('project_organization_members_member_unit_uq').on(t.userId, t.organizationUnitId),
    uniqueIndex('project_organization_members_leader_uq')
      .on(t.organizationUnitId)
      .where(sql`${t.duty} = 'leader'`),
    index('project_organization_members_user_idx').on(t.projectId, t.userId),
  ],
)

export const positions = pgTable(
  'positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id'),
    name: varchar('name', { length: 100 }).notNull(),
    nameKey: text('name_key').notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    codeKey: varchar('code_key', { length: 32 }).notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    status: accessStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    sourceTemplatePositionId: uuid('source_template_position_id'),
    ...organizationTimes(),
  },
  /** 岗位保持作用域平面唯一，不携带任何组织单元关联。 */
  (t) => [
    foreignKey({ columns: [t.companyId], foreignColumns: [companies.id] }).onDelete('restrict'),
    foreignKey({
      columns: [t.companyId, t.projectId],
      foreignColumns: [projects.companyId, projects.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.sourceTemplatePositionId],
      foreignColumns: [organizationTemplatePositions.id],
    }).onDelete('restrict'),
    check(
      'positions_scope_check',
      sql`(${t.scopeType} = 'company' AND ${t.projectId} IS NULL) OR (${t.scopeType} = 'project' AND ${t.projectId} IS NOT NULL)`,
    ),
    unique('positions_company_ref_uq').on(t.id, t.scopeType, t.companyId),
    unique('positions_project_ref_uq').on(t.id, t.scopeType, t.companyId, t.projectId),
    uniqueIndex('positions_company_name_key_uq')
      .on(t.companyId, t.nameKey)
      .where(sql`${t.scopeType} = 'company'`),
    uniqueIndex('positions_company_code_key_uq')
      .on(t.companyId, t.codeKey)
      .where(sql`${t.scopeType} = 'company'`),
    uniqueIndex('positions_project_name_key_uq')
      .on(t.projectId, t.nameKey)
      .where(sql`${t.scopeType} = 'project'`),
    uniqueIndex('positions_project_code_key_uq')
      .on(t.projectId, t.codeKey)
      .where(sql`${t.scopeType} = 'project'`),
    check('positions_name_length', sql`char_length(${t.name}) BETWEEN 2 AND 100`),
    check(
      'positions_name_key_normalized',
      sql`${t.nameKey} = lower(normalize(btrim(${t.name}), NFKC))`,
    ),
    check(
      'positions_code_check',
      sql`char_length(${t.code}) BETWEEN 2 AND 32 AND ${t.code} ~ '^[a-z0-9_-]+$'`,
    ),
    check(
      'positions_code_key_normalized',
      sql`${t.codeKey} = lower(normalize(btrim(${t.code}), NFKC))`,
    ),
    check('positions_version_positive', sql`${t.version} > 0`),
    index('positions_scope_created_idx').on(
      t.scopeType,
      t.companyId,
      t.projectId,
      t.createdAt,
      t.id,
    ),
  ],
)

export const companyPositionMembers = pgTable(
  'company_position_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull().default('company'),
    companyId: uuid('company_id').notNull(),
    positionId: uuid('position_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /** 组合外键保证企业岗位任职两端属于同一个企业。 */
  (t) => [
    check('company_position_members_scope_check', sql`${t.scopeType} = 'company'`),
    foreignKey({
      columns: [t.positionId, t.scopeType, t.companyId],
      foreignColumns: [positions.id, positions.scopeType, positions.companyId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.companyId, t.userId],
      foreignColumns: [companyMembers.companyId, companyMembers.userId],
    }).onDelete('cascade'),
    unique('company_position_members_user_position_uq').on(t.userId, t.positionId),
    index('company_position_members_position_idx').on(t.positionId),
  ],
)

export const projectPositionMembers = pgTable(
  'project_position_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull().default('project'),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    positionId: uuid('position_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /** 组合外键保证项目岗位任职两端属于同一个项目。 */
  (t) => [
    check('project_position_members_scope_check', sql`${t.scopeType} = 'project'`),
    foreignKey({
      columns: [t.positionId, t.scopeType, t.companyId, t.projectId],
      foreignColumns: [positions.id, positions.scopeType, positions.companyId, positions.projectId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.projectId, t.userId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }).onDelete('cascade'),
    unique('project_position_members_user_position_uq').on(t.userId, t.positionId),
    index('project_position_members_position_idx').on(t.positionId),
  ],
)

export const organizationTemplates = pgTable(
  'organization_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 100 }).notNull(),
    nameKey: text('name_key').notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    status: accessStatus('status').notNull().default('active'),
    isDefault: boolean('is_default').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...organizationTimes(),
  },
  /** 企业内模板名称唯一，并只允许一个启用中的默认模板。 */
  (t) => [
    uniqueIndex('organization_templates_company_name_key_uq').on(t.companyId, t.nameKey),
    uniqueIndex('organization_templates_company_default_uq')
      .on(t.companyId)
      .where(sql`${t.status} = 'active' AND ${t.isDefault} = true`),
    check('organization_templates_name_length', sql`char_length(${t.name}) BETWEEN 2 AND 100`),
    check(
      'organization_templates_name_key_normalized',
      sql`${t.nameKey} = lower(normalize(btrim(${t.name}), NFKC))`,
    ),
    check('organization_templates_version_positive', sql`${t.version} > 0`),
  ],
)

export const organizationTemplateUnits = pgTable(
  'organization_template_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => organizationTemplates.id, { onDelete: 'restrict' }),
    templateVersion: integer('template_version').notNull(),
    parentId: uuid('parent_id'),
    name: varchar('name', { length: 100 }).notNull(),
    nameKey: text('name_key').notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    codeKey: varchar('code_key', { length: 32 }).notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    sort: integer('sort').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /** 模板组织节点在每个不可变版本内保持父子完整性和唯一规则。 */
  (t) => [
    unique('organization_template_units_version_id_uq').on(t.templateId, t.templateVersion, t.id),
    foreignKey({
      columns: [t.templateId, t.templateVersion, t.parentId],
      foreignColumns: [t.templateId, t.templateVersion, t.id],
    }).onDelete('restrict'),
    uniqueIndex('organization_template_units_version_code_uq').on(
      t.templateId,
      t.templateVersion,
      t.codeKey,
    ),
    uniqueIndex('organization_template_units_root_name_uq')
      .on(t.templateId, t.templateVersion, t.nameKey)
      .where(sql`${t.parentId} IS NULL`),
    uniqueIndex('organization_template_units_parent_name_uq')
      .on(t.templateId, t.templateVersion, t.parentId, t.nameKey)
      .where(sql`${t.parentId} IS NOT NULL`),
    check('organization_template_units_name_length', sql`char_length(${t.name}) BETWEEN 2 AND 100`),
    check(
      'organization_template_units_name_key_normalized',
      sql`${t.nameKey} = lower(normalize(btrim(${t.name}), NFKC))`,
    ),
    check(
      'organization_template_units_code_check',
      sql`char_length(${t.code}) BETWEEN 2 AND 32 AND ${t.code} ~ '^[a-z0-9_-]+$'`,
    ),
    check(
      'organization_template_units_code_key_normalized',
      sql`${t.codeKey} = lower(normalize(btrim(${t.code}), NFKC))`,
    ),
    check('organization_template_units_sort_range', sql`${t.sort} BETWEEN 0 AND 999999999`),
    check('organization_template_units_version_positive', sql`${t.templateVersion} > 0`),
  ],
)

export const organizationTemplatePositions = pgTable(
  'organization_template_positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => organizationTemplates.id, { onDelete: 'restrict' }),
    templateVersion: integer('template_version').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    nameKey: text('name_key').notNull(),
    code: varchar('code', { length: 32 }).notNull(),
    codeKey: varchar('code_key', { length: 32 }).notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    status: accessStatus('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /** 模板岗位在每个版本内按名称和编码分别唯一，不关联模板组织节点。 */
  (t) => [
    uniqueIndex('organization_template_positions_version_name_uq').on(
      t.templateId,
      t.templateVersion,
      t.nameKey,
    ),
    uniqueIndex('organization_template_positions_version_code_uq').on(
      t.templateId,
      t.templateVersion,
      t.codeKey,
    ),
    check(
      'organization_template_positions_name_length',
      sql`char_length(${t.name}) BETWEEN 2 AND 100`,
    ),
    check(
      'organization_template_positions_name_key_normalized',
      sql`${t.nameKey} = lower(normalize(btrim(${t.name}), NFKC))`,
    ),
    check(
      'organization_template_positions_code_check',
      sql`char_length(${t.code}) BETWEEN 2 AND 32 AND ${t.code} ~ '^[a-z0-9_-]+$'`,
    ),
    check(
      'organization_template_positions_code_key_normalized',
      sql`${t.codeKey} = lower(normalize(btrim(${t.code}), NFKC))`,
    ),
    check('organization_template_positions_version_positive', sql`${t.templateVersion} > 0`),
  ],
)
