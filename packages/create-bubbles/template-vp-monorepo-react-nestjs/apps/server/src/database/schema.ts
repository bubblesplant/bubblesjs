import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
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
  id: uuid('id').defaultRandom().primaryKey(),
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

export const refreshTokenFamilies = pgTable(
  'refresh_token_families',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id, { onDelete: 'restrict' }),
    status: refreshFamilyStatusEnum('status').default('active').notNull(),
    accountEpochAtCreate: integer('account_epoch_at_create').notNull(),
    currentGeneration: integer('current_generation').default(1).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updateAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('refresh_families_session_id_uidx').on(table.sessionId),
    index('refresh_families_status_idx').on(table.status),
  ],
)

export const authOutbox = pgTable(
  'auth_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    aggregateType: varchar('aggregate_type', { length: 30 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 100 }).notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),

    // JSONB 必须由 Worker 做运行时校验，不能静态信任。
    payload: jsonb('payload').$type<unknown>().notNull(),

    attempts: integer('attempts').default(0).notNull(),
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastError: varchar('last_error', { length: 1000 }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('auth_outbox_claim_idx').on(
      table.publishedAt,
      table.nextAttemptAt,
      table.lockedAt,
      table.createdAt,
    ),
  ],
)
