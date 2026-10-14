import { users } from '@/database/schema'
import { createInsertSchema } from 'drizzle-zod'
import type { DbCreateUserRequest } from 'shared/types'
import type { z } from 'zod'

/** 基于现有表结构生成请求规则，排除由服务端管理的字段。 */
export const createUserSchema = createInsertSchema(users).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}) satisfies z.ZodType<DbCreateUserRequest>
