import { registerAs } from '@nestjs/config'

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_DATABASE ?? 'postgres',
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD,
}))
