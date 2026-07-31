import { ENV_ARR } from '@/utils/env-arr'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

for (const path of ENV_ARR) {
  config({ path })
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 未配置')
}

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
