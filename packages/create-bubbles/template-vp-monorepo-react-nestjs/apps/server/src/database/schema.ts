import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['active', 'locked', 'disabled'])

export const authSessionStatusEnum = pgEnum('auth_session_status', ['active', 'revoked'])

export const refreshFamilyStatusEnum = pgEnum('refresh_family_status', [
  'active',
  'revoked',
  'compromised',
])

export const refreshTokenStatusEnum = pgEnum('refresh_token_status', [
  'active',
  'consumed',
  'revoked',
])

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  // 第一阶段先允许 null，旧账号完成密码回填后再改成 notNull
  passwordHash: varchar('password_hash', { length: 255 }), // .notNull(),

  status: userStatusEnum('status').default('active').notNull(),
  authEpoch: integer('auth_epoch').default(1).notNull(),
  passwordChangeAt: timestamp('password_change_at', {
    withTimezone: true,
  }),

  createdAt: timestamp('create_at').defaultNow().notNull(),
  updatedAt: timestamp('update_at', { withTimezone: true }).defaultNow().notNull(),
})

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    version: integer('version').default(1).notNull(),
    status: authSessionStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 100 }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_user_status_idx').on(table.userId, table.status),
  ],
)

export const refreshTokenFamilies = pgTable('refresh_token_families', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => authSessions.id, { onDelete: 'restrict' }),
})
