import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import {
  CONFIG_FILE_NAMES,
  ConfigLoadError,
  ConfigNotFoundError,
  ConfigValidationError,
  loadConfig,
  validateConfig,
} from '../src/load-config.ts'
import { useTemporaryDirectory } from './temporary-directory.ts'

const validConfig = {
  callNames: ['tr'],
  projects: {
    web: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: [],
      catalogs: {
        zh_CN: 'locales/zh_CN.json',
      },
    },
  },
  report: '.bubbles-i18n/report.json',
}

describe('loadConfig', () => {
  const temporaryDirectory = useTemporaryDirectory()

  it.each([
    ['i18n.config.ts', createEsmConfigSource()],
    ['i18n.config.mts', createEsmConfigSource()],
    ['i18n.config.js', createCommonJsConfigSource()],
    ['i18n.config.mjs', createEsmConfigSource()],
    ['i18n.config.cts', createCommonJsConfigSource()],
    ['i18n.config.cjs', createCommonJsConfigSource()],
  ])('discovers %s while walking upward', async (fileName, source) => {
    const configPath = join(temporaryDirectory.path, fileName)
    const cwd = join(temporaryDirectory.path, 'apps', 'web', 'src')
    await mkdir(cwd, { recursive: true })
    await writeFile(configPath, source, 'utf8')

    const loaded = await loadConfig({ cwd })

    expect(loaded).toEqual({
      configPath,
      rootDir: temporaryDirectory.path,
      config: validConfig,
    })
  })

  it('uses the first candidate when multiple config formats exist in one directory', async () => {
    const tsPath = join(temporaryDirectory.path, CONFIG_FILE_NAMES[0])
    await writeFile(tsPath, createEsmConfigSource(), 'utf8')
    await writeFile(
      join(temporaryDirectory.path, 'i18n.config.mjs'),
      'export default { projects: {} }',
      'utf8',
    )

    const loaded = await loadConfig({ cwd: temporaryDirectory.path })

    expect(loaded.configPath).toBe(tsPath)
  })

  it('resolves an explicit config path relative to cwd', async () => {
    const cwd = join(temporaryDirectory.path, 'workspace')
    const configPath = join(cwd, 'config', 'custom-i18n.ts')
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, createEsmConfigSource(), 'utf8')

    const loaded = await loadConfig({ cwd, configPath: './config/custom-i18n.ts' })

    expect(loaded.configPath).toBe(configPath)
    expect(loaded.rootDir).toBe(dirname(configPath))
    expect(loaded.config).toEqual(validConfig)
  })

  it('reports the searched directory and supported names when discovery fails', async () => {
    await expect(loadConfig({ cwd: temporaryDirectory.path })).rejects.toThrowError(
      ConfigNotFoundError,
    )
    await expect(loadConfig({ cwd: temporaryDirectory.path })).rejects.toThrow(
      `Could not find an i18n config from "${resolve(temporaryDirectory.path)}" upward`,
    )
  })

  it('reports the resolved path when an explicit config is missing', async () => {
    const expectedPath = join(temporaryDirectory.path, 'missing.ts')

    await expect(
      loadConfig({ cwd: temporaryDirectory.path, configPath: './missing.ts' }),
    ).rejects.toThrow(`Could not find the explicit i18n config at "${expectedPath}"`)
  })

  it('requires a default export', async () => {
    const configPath = join(temporaryDirectory.path, 'i18n.config.mjs')
    await writeFile(configPath, 'export const config = {}', 'utf8')

    await expect(loadConfig({ cwd: temporaryDirectory.path })).rejects.toThrowError(
      ConfigValidationError,
    )
    await expect(loadConfig({ cwd: temporaryDirectory.path })).rejects.toThrow(
      'the module must have a default export',
    )
  })

  it('wraps module evaluation failures with the config path and preserves the cause', async () => {
    const configPath = join(temporaryDirectory.path, 'i18n.config.mjs')
    await writeFile(configPath, 'throw new Error("module failed")', 'utf8')

    const error = await loadConfig({ cwd: temporaryDirectory.path }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ConfigLoadError)
    expect(error).toMatchObject({
      message: `Failed to load i18n config at "${configPath}"`,
      cause: expect.objectContaining({ message: 'module failed' }),
    })
  })
})

describe('validateConfig', () => {
  it('accepts a complete config and returns the original object', () => {
    expect(validateConfig(validConfig)).toBe(validConfig)
  })

  it.each([
    [undefined, 'the default export must be an object'],
    [{}, 'projects must be a non-empty object'],
    [{ projects: {} }, 'projects must be a non-empty object'],
    [{ projects: { web: null } }, 'projects["web"] must be an object'],
    [
      { projects: { web: { include: [], catalogs: { en_US: 'en.json' } } } },
      'projects["web"].include must be a non-empty array of strings',
    ],
    [
      { projects: { web: { include: [''], catalogs: { en_US: 'en.json' } } } },
      'projects["web"].include[0] must be a non-empty string',
    ],
    [
      {
        projects: {
          web: { include: ['src/**/*.ts'], exclude: 'dist', catalogs: { en_US: 'en.json' } },
        },
      },
      'projects["web"].exclude must be an array of non-empty strings',
    ],
    [
      { projects: { web: { include: ['src/**/*.ts'], catalogs: {} } } },
      'projects["web"].catalogs must be a non-empty object',
    ],
    [
      { projects: { web: { include: ['src/**/*.ts'], catalogs: { en_US: '' } } } },
      'projects["web"].catalogs["en_US"] must be a non-empty string',
    ],
    [
      {
        callNames: [],
        projects: { web: { include: ['src/**/*.ts'], catalogs: { en_US: 'en.json' } } },
      },
      'callNames must be a non-empty array of strings',
    ],
    [
      {
        callNames: [' '],
        projects: { web: { include: ['src/**/*.ts'], catalogs: { en_US: 'en.json' } } },
      },
      'callNames[0] must be a non-empty string',
    ],
    [
      {
        projects: { web: { include: ['src/**/*.ts'], catalogs: { en_US: 'en.json' } } },
        report: '',
      },
      'report must be a non-empty string',
    ],
  ])('rejects invalid config %#', (config, message) => {
    expect(() => validateConfig(config, 'test.config.ts')).toThrowError(ConfigValidationError)
    expect(() => validateConfig(config, 'test.config.ts')).toThrow(message)
  })
})

function createEsmConfigSource(): string {
  return `export default ${JSON.stringify(validConfig)}`
}

function createCommonJsConfigSource(): string {
  return `module.exports = ${JSON.stringify(validConfig)}`
}
