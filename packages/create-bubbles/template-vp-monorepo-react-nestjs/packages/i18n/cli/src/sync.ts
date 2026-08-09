import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'

import type { SyncFileReport } from './report.ts'

export interface SyncCatalogOptions {
  project: string
  locale: string
  path: string
  keys: Iterable<string>
  clean?: boolean
  dryRun?: boolean
  allowEmpty?: boolean
}

export interface SyncProjectOptions {
  project: string
  catalogs: Readonly<Record<string, string>>
  keys: Iterable<string>
  clean?: boolean
  dryRun?: boolean
  allowEmpty?: boolean
}

export class CatalogValidationError extends Error {
  override name = 'CatalogValidationError'
}

export class EmptyScanCleanError extends Error {
  override name = 'EmptyScanCleanError'
}

interface CatalogFormat {
  bom: boolean
  eol: '\n' | '\r\n'
  indent: string | number | undefined
  trailingEol: boolean
}

interface CatalogState {
  exists: boolean
  messages: Record<string, string>
  format: CatalogFormat
}

interface CatalogPlan {
  path: string
  content: string
  shouldWrite: boolean
  report: SyncFileReport
}

const defaultFormat: CatalogFormat = {
  bom: false,
  eol: '\n',
  indent: 2,
  trailingEol: true,
}

export async function syncCatalog(options: SyncCatalogOptions): Promise<SyncFileReport> {
  const keys = normalizeKeys(options.keys)
  const plan = await planCatalog(options, keys)

  if (!(options.dryRun ?? false) && plan.shouldWrite) {
    await writeAtomic(plan.path, plan.content)
  }

  return plan.report
}

export async function syncProject(options: SyncProjectOptions): Promise<SyncFileReport[]> {
  const keys = normalizeKeys(options.keys)
  const plans = await Promise.all(
    Object.entries(options.catalogs).map(([locale, path]) =>
      planCatalog(
        {
          ...options,
          locale,
          path,
        },
        keys,
      ),
    ),
  )

  if (!(options.dryRun ?? false)) {
    await Promise.all(
      plans.map(async (plan) => {
        if (plan.shouldWrite) {
          await writeAtomic(plan.path, plan.content)
        }
      }),
    )
  }

  return plans.map((plan) => plan.report)
}

async function planCatalog(
  options: SyncCatalogOptions,
  keys: ReadonlySet<string>,
): Promise<CatalogPlan> {
  if (!isAbsolute(options.path)) {
    throw new TypeError(`Catalog path must be absolute: "${options.path}"`)
  }

  const state = await readCatalog(options.path)
  const existingKeys = Object.keys(state.messages)
  const added = sortKeys(
    [...keys].filter((key) => !Object.prototype.hasOwnProperty.call(state.messages, key)),
  )
  const stale = sortKeys(existingKeys.filter((key) => !keys.has(key)))
  const clean = options.clean ?? false

  if (clean && keys.size === 0 && existingKeys.length > 0 && !(options.allowEmpty ?? false)) {
    throw new EmptyScanCleanError(
      `Refusing to clean non-empty catalog "${options.path}" because the source scan found no keys. ` +
        'Pass allowEmpty: true only when clearing the catalog is intentional.',
    )
  }

  const deleted = clean ? stale : []
  const unused = clean ? [] : stale
  const retainedEntries = Object.entries(state.messages).filter(([key]) => !deleted.includes(key))
  const nextMessages = Object.fromEntries([
    ...retainedEntries,
    ...added.map((key): [string, string] => [key, key]),
  ])
  const shouldWrite = !state.exists || added.length > 0 || deleted.length > 0

  return {
    path: options.path,
    content: serializeCatalog(nextMessages, state.format),
    shouldWrite,
    report: {
      project: options.project,
      path: options.path,
      locale: options.locale,
      added,
      unused,
      deleted,
      unchangedCount: existingKeys.filter((key) => keys.has(key)).length,
    },
  }
}

async function readCatalog(path: string): Promise<CatalogState> {
  let source: string

  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {
        exists: false,
        messages: {},
        format: defaultFormat,
      }
    }

    throw error
  }

  const format = detectFormat(source)
  const json = format.bom ? source.slice(1) : source
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new CatalogValidationError(
      `Catalog "${path}" contains invalid JSON: ${errorMessage(error)}`,
    )
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CatalogValidationError(
      `Catalog "${path}" must contain a flat JSON object with string values.`,
    )
  }

  const entries = Object.entries(parsed as Record<string, unknown>)

  for (const [key, value] of entries) {
    if (typeof value !== 'string') {
      throw new CatalogValidationError(
        `Catalog "${path}" must contain only string values; key "${key}" is ${valueType(value)}.`,
      )
    }
  }

  return {
    exists: true,
    messages: Object.fromEntries(entries) as Record<string, string>,
    format,
  }
}

function detectFormat(source: string): CatalogFormat {
  const bom = source.startsWith('\uFEFF')
  const json = bom ? source.slice(1) : source
  const eol = json.includes('\r\n') ? '\r\n' : '\n'
  const indentation = json.match(/\r?\n([\t ]+)"/u)?.[1]
  const hasLineBreak = json.includes('\n')

  return {
    bom,
    eol,
    indent: indentation?.slice(0, 10) ?? (hasLineBreak ? 2 : undefined),
    trailingEol: json.endsWith('\n'),
  }
}

function serializeCatalog(messages: Record<string, string>, format: CatalogFormat): string {
  const serialized = JSON.stringify(messages, undefined, format.indent) ?? '{}'
  const withEol = format.eol === '\n' ? serialized : serialized.split('\n').join(format.eol)
  const withTrailingEol = format.trailingEol ? `${withEol}${format.eol}` : withEol

  return format.bom ? `\uFEFF${withTrailingEol}` : withTrailingEol
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const directory = dirname(path)
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)

  await mkdir(directory, { recursive: true })

  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function normalizeKeys(keys: Iterable<string>): ReadonlySet<string> {
  const normalized = new Set<string>()

  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new TypeError('Scanned message keys must be strings.')
    }

    normalized.add(key)
  }

  return normalized
}

function sortKeys(keys: string[]): string[] {
  return keys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function valueType(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'an array'
  }

  return `a ${typeof value}`
}
