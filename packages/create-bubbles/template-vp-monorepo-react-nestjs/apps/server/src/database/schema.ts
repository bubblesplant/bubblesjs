import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

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

export const uploadStatusEnum = pgEnum('upload_status', [
  'uploading',
  'completing',
  'completed',
  'aborting',
  'aborted',
  'expired',
])

export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientUploadId: uuid('client_upload_id').notNull(),
    bucket: varchar('bucket', { length: 63 }).notNull(),
    objectKey: varchar('object_key', { length: 1024 }).notNull(),
    storageUploadId: text('storage_upload_id').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 255 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    partSize: integer('part_size').notNull(),
    totalParts: integer('total_parts').notNull(),
    status: uploadStatusEnum('status').default('uploading').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    objectEtag: text('object_etag'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('upload_sessions_owner_client_uq').on(table.ownerId, table.clientUploadId),
    uniqueIndex('upload_sessions_bucket_key_uq').on(table.bucket, table.objectKey),
    index('upload_sessions_owner_status_expires_idx').on(
      table.ownerId,
      table.status,
      table.expiresAt,
    ),
    index('upload_sessions_status_expires_idx').on(table.status, table.expiresAt),
    index('upload_sessions_status_updated_idx').on(table.status, table.updatedAt),
  ],
)
