import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({
  path: '.env.development',
})

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
