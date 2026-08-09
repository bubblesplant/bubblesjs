import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const jobRunStatus = pgEnum('job_run_status', [
  'queued',
  'processing',
  'completed',
  'failed',
])

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queueName: varchar('queue_name', { length: 100 }).notNull(),
    jobName: varchar('job_name', { length: 100 }).notNull(),
    status: jobRunStatus('status').default('queued').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('job_runs_status_created_at_idx').on(table.status, table.createdAt),
    index('job_runs_queue_name_idx').on(table.queueName),
  ],
)

export type JobRun = typeof jobRuns.$inferSelect
