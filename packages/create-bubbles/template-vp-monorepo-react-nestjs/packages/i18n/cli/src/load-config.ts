import { stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { I18nConfig } from './config.ts'

export const CONFIG_FILE_NAMES = [
  'i18n.config.ts',
  'i18n.config.mts',
  'i18n.config.js',
  'i18n.config.mjs',
  'i18n.config.cts',
  'i18n.config.cjs',
] as const

export interface LoadConfigOptions {
  readonly cwd?: string
  readonly configPath?: string
}

export interface LoadedI18nConfig {
  readonly configPath: string
  readonly rootDir: string
  readonly config: I18nConfig
}

export class ConfigNotFoundError extends Error {
  override readonly name = 'ConfigNotFoundError'
}

export class ConfigLoadError extends Error {
  override readonly name = 'ConfigLoadError'
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.cause = cause
  }
}

export class ConfigValidationError extends Error {
  override readonly name = 'ConfigValidationError'
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedI18nConfig> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const configPath =
    options.configPath === undefined
      ? await findConfigPath(cwd)
      : await resolveExplicitConfigPath(options.configPath, cwd)

  let importedConfig: unknown

  try {
    const module = (await import(pathToFileURL(configPath).href)) as Record<string, unknown>

    if (!Object.prototype.hasOwnProperty.call(module, 'default')) {
      throw new ConfigValidationError(
        `Invalid i18n config at "${configPath}": the module must have a default export`,
      )
    }

    importedConfig = module.default
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error
    }

    throw new ConfigLoadError(`Failed to load i18n config at "${configPath}"`, error)
  }

  return {
    configPath,
    rootDir: dirname(configPath),
    config: validateConfig(importedConfig, configPath),
  }
}

export function validateConfig(value: unknown, configPath = '<config>'): I18nConfig {
  const prefix = `Invalid i18n config at "${configPath}"`

  if (!isRecord(value)) {
    throw new ConfigValidationError(`${prefix}: the default export must be an object`)
  }

  const projects = value.projects
  if (!isRecord(projects) || Object.keys(projects).length === 0) {
    throw new ConfigValidationError(`${prefix}: projects must be a non-empty object`)
  }

  for (const [projectName, project] of Object.entries(projects)) {
    if (projectName.trim() === '') {
      throw new ConfigValidationError(`${prefix}: project names must be non-empty strings`)
    }

    const projectPath = `projects[${JSON.stringify(projectName)}]`
    if (!isRecord(project)) {
      throw new ConfigValidationError(`${prefix}: ${projectPath} must be an object`)
    }

    validateStringArray(project.include, `${projectPath}.include`, prefix, { nonEmpty: true })

    if (project.exclude !== undefined) {
      validateStringArray(project.exclude, `${projectPath}.exclude`, prefix)
    }

    const catalogs = project.catalogs
    if (!isRecord(catalogs) || Object.keys(catalogs).length === 0) {
      throw new ConfigValidationError(
        `${prefix}: ${projectPath}.catalogs must be a non-empty object`,
      )
    }

    for (const [locale, catalogPath] of Object.entries(catalogs)) {
      if (locale.trim() === '') {
        throw new ConfigValidationError(
          `${prefix}: ${projectPath}.catalogs locale names must be non-empty strings`,
        )
      }

      if (typeof catalogPath !== 'string' || catalogPath.trim() === '') {
        throw new ConfigValidationError(
          `${prefix}: ${projectPath}.catalogs[${JSON.stringify(locale)}] must be a non-empty string`,
        )
      }
    }
  }

  if (value.callNames !== undefined) {
    validateStringArray(value.callNames, 'callNames', prefix, { nonEmpty: true })
  }

  if (
    value.report !== undefined &&
    (typeof value.report !== 'string' || value.report.trim() === '')
  ) {
    throw new ConfigValidationError(`${prefix}: report must be a non-empty string`)
  }

  return value as unknown as I18nConfig
}

async function findConfigPath(cwd: string): Promise<string> {
  let directory = cwd

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const candidate = resolve(directory, fileName)
      if (await isFile(candidate)) {
        return candidate
      }
    }

    const parent = dirname(directory)
    if (parent === directory) {
      break
    }
    directory = parent
  }

  throw new ConfigNotFoundError(
    `Could not find an i18n config from "${cwd}" upward. Expected one of: ${CONFIG_FILE_NAMES.join(', ')}`,
  )
}

async function resolveExplicitConfigPath(configPath: string, cwd: string): Promise<string> {
  if (configPath.trim() === '') {
    throw new ConfigNotFoundError('The explicit i18n config path must be a non-empty string')
  }

  const resolvedPath = isAbsolute(configPath) ? resolve(configPath) : resolve(cwd, configPath)
  if (!(await isFile(resolvedPath))) {
    throw new ConfigNotFoundError(
      `Could not find the explicit i18n config at "${resolvedPath}" (resolved from "${cwd}")`,
    )
  }

  return resolvedPath
}

function validateStringArray(
  value: unknown,
  path: string,
  prefix: string,
  options: { readonly nonEmpty?: boolean } = {},
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new ConfigValidationError(`${prefix}: ${path} must be an array of non-empty strings`)
  }

  if (options.nonEmpty === true && value.length === 0) {
    throw new ConfigValidationError(`${prefix}: ${path} must be a non-empty array of strings`)
  }

  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new ConfigValidationError(`${prefix}: ${path}[${index}] must be a non-empty string`)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (isMissingPathError(error)) {
      return false
    }
    throw error
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}
