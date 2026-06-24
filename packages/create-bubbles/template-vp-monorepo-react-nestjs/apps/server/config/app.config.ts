import { registerAs } from '@nestjs/config'

export default registerAs('app', () => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  env: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET,
}))
