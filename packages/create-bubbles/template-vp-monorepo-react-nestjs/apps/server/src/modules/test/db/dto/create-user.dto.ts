import { users } from '@/database/schema'
import { createInsertSchema } from 'drizzle-zod'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
/**
 * 1. 基于数据库表生成zod schema
 *   drizzle-zod 会自动把 varchar({ length: 100 }) 翻成 .max(100)
 *   把notNull 翻成 必填字段
 */

const baseSchema = createInsertSchema(users, {
  // 数据库不知道邮箱格式， 这里用zod增强
  email: z.email(),
})

/**
 * 2. 创建用户的入参不应该包括 id 和 createdAt(这两数据库自动生成)
 */
export const createUserSchema = baseSchema.omit({
  id: true,
  passwordHash: true,
  status: true,
  authEpoch: true,
  passwordChangeAt: true,
  createdAt: true,
  updatedAt: true,
})

/**
 * 3. 包成nestjs dto
 */
export class CreateUserDto extends createZodDto(createUserSchema) {}
