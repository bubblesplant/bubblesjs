import { pgEnum } from 'drizzle-orm/pg-core'
import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core'

export const useStatusEnum = pgEnum('user_status', ['active', 'locked', 'disabled'])

export const authSessionStatusEnum = pgEnum('auth_session_status', ['active', 'revoked'])

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('create_at').defaultNow().notNull(),
})
