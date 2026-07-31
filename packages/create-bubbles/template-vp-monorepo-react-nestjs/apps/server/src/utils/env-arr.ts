const NODE_ENV = process.env.NODE_ENV ?? 'development'

export const ENV_ARR = [`.env.${NODE_ENV}.local`, `.env.local`, `.env.${NODE_ENV}`, `.env`]
