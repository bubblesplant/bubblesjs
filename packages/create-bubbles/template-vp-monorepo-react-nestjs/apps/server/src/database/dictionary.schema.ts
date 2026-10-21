import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import type { DictionaryItem } from 'shared/types'
import { accessStatus, companies, projects, scopeType } from './access.schema'

export const dictionaries = pgTable(
  'dictionaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scopeType: scopeType('scope_type').notNull(),
    companyId: uuid('company_id').references(() => companies.id),
    projectId: uuid('project_id'),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description').notNull().default(''),
    status: accessStatus('status').notNull().default('active'),
    items: jsonb('items').$type<DictionaryItem[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  /** 数据库兜底隔离归属、编码唯一及项目所属企业，阻止跨域脏数据。 */
  (t) => [
    foreignKey({
      name: 'dictionaries_project_company_fk',
      columns: [t.companyId, t.projectId],
      foreignColumns: [projects.companyId, projects.id],
    }),
    check(
      'dictionaries_scope_valid',
      sql`(
    (${t.scopeType} = 'platform' AND ${t.companyId} IS NULL AND ${t.projectId} IS NULL) OR
    (${t.scopeType} = 'company' AND ${t.companyId} IS NOT NULL AND ${t.projectId} IS NULL) OR
    (${t.scopeType} = 'project' AND ${t.companyId} IS NOT NULL AND ${t.projectId} IS NOT NULL)
  )`,
    ),
    check('dictionaries_code_valid', sql`${t.code} ~ '^[a-z][a-z0-9_]*$'`),
    check('dictionaries_version_positive', sql`${t.version} > 0`),
    check(
      'dictionaries_items_valid',
      sql`jsonb_typeof(${t.items}) = 'array' AND jsonb_array_length(${t.items}) <= 500`,
    ),
    uniqueIndex('dictionaries_platform_code_uq')
      .on(t.code)
      .where(sql`${t.scopeType} = 'platform'`),
    uniqueIndex('dictionaries_company_code_uq')
      .on(t.companyId, t.code)
      .where(sql`${t.scopeType} = 'company'`),
    uniqueIndex('dictionaries_project_code_uq')
      .on(t.companyId, t.projectId, t.code)
      .where(sql`${t.scopeType} = 'project'`),
  ],
)
