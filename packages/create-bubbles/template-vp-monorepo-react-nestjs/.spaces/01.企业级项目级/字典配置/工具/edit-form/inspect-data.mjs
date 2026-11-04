import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const serverRoot = resolve(featureRoot, '../../../apps/server')
const require = createRequire(resolve(serverRoot, 'package.json'))
const { config } = require('dotenv')
for (const name of ['.env.development.local', '.env.local', '.env.development', '.env']) {
  config({ path: resolve(serverRoot, name), quiet: true })
}
const host = process.env.DB_HOST ?? 'localhost'
assert(['localhost', '127.0.0.1', '::1'].includes(host), '仅核对本机开发库')
const { Pool } = require('pg')
const pool = new Pool({
  host,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_DATABASE ?? 'postgres',
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 3000,
})

try {
  await pool.query('BEGIN READ ONLY')
  const result = await pool.query(
    `SELECT code, scope_type, jsonb_array_length(items) AS item_count,
            version, created_at, updated_at
       FROM dictionaries WHERE code = $1`,
    ['nation'],
  )
  await pool.query('ROLLBACK')
  const report = { executedAt: new Date().toISOString(), readOnly: true, records: result.rows }
  const evidence = resolve(featureRoot, '测试证据/edit-form')
  await mkdir(evidence, { recursive: true })
  await writeFile(resolve(evidence, 'local-data.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await pool.end()
}
