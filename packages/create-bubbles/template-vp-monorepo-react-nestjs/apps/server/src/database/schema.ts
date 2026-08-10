import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['active', 'locked', 'disabled'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  account: varchar('account', { length: 32 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  status: userStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('create_at').defaultNow().notNull(),
  updatedAt: timestamp('update_at', { withTimezone: true }).defaultNow().notNull(),
})
