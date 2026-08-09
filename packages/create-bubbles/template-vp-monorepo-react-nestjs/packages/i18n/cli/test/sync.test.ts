import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import {
  CatalogValidationError,
  EmptyScanCleanError,
  syncCatalog,
  syncProject,
} from '../src/sync.ts'
import { useTemporaryDirectory } from './temporary-directory.ts'

describe('syncCatalog', () => {
  const temporaryDirectory = useTemporaryDirectory()

  it('creates a missing catalog and initializes every key with itself', async () => {
    const path = join(temporaryDirectory.path, 'locales', 'en_US.json')

    const report = await syncCatalog({
      project: 'web',
      locale: 'en_US',
      path,
      keys: new Set(['中文', 'English']),
    })

    expect(report.added).toEqual(['English', '中文'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      English: 'English',
      中文: '中文',
    })
  })

  it('adds missing keys, keeps translations and is idempotent', async () => {
    const path = join(temporaryDirectory.path, 'en_US.json')
    const initial = '{\r\n    "existing": "Translated",\r\n    "unused": "Old"\r\n}\r\n'
    await writeFile(path, initial, 'utf8')

    const first = await syncCatalog({
      project: 'web',
      locale: 'en_US',
      path,
      keys: new Set(['existing', 'new message']),
    })

    expect(first).toEqual({
      project: 'web',
      path,
      locale: 'en_US',
      added: ['new message'],
      unused: ['unused'],
      deleted: [],
      unchangedCount: 1,
    })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      existing: 'Translated',
      unused: 'Old',
      'new message': 'new message',
    })

    const afterFirstSync = await readFile(path, 'utf8')
    expect(afterFirstSync).toContain('\r\n    "new message"')

    const second = await syncCatalog({
      project: 'web',
      locale: 'en_US',
      path,
      keys: new Set(['existing', 'new message']),
    })

    expect(second.added).toEqual([])
    expect(second.unused).toEqual(['unused'])
    expect(second.unchangedCount).toBe(2)
    expect(await readFile(path, 'utf8')).toBe(afterFirstSync)
  })

  it('deletes unused keys only when clean is enabled', async () => {
    const path = join(temporaryDirectory.path, 'zh_CN.json')
    await writeFile(path, '{\n  "保留": "翻译",\n  "旧文案": "旧翻译"\n}\n', 'utf8')

    const report = await syncCatalog({
      project: 'web',
      locale: 'zh_CN',
      path,
      keys: new Set(['保留', '新增']),
      clean: true,
    })

    expect(report.added).toEqual(['新增'])
    expect(report.unused).toEqual([])
    expect(report.deleted).toEqual(['旧文案'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      保留: '翻译',
      新增: '新增',
    })
  })

  it('reports changes without writing in dry-run mode', async () => {
    const path = join(temporaryDirectory.path, 'dry-run.json')
    const initial = '{"used":"Translation","stale":"Old"}'
    await writeFile(path, initial, 'utf8')

    const report = await syncCatalog({
      project: 'web',
      locale: 'en_US',
      path,
      keys: new Set(['used', 'new']),
      clean: true,
      dryRun: true,
    })

    expect(report.added).toEqual(['new'])
    expect(report.deleted).toEqual(['stale'])
    expect(await readFile(path, 'utf8')).toBe(initial)

    const missingPath = join(temporaryDirectory.path, 'missing.json')
    await syncCatalog({
      project: 'web',
      locale: 'fr_FR',
      path: missingPath,
      keys: new Set(['new']),
      dryRun: true,
    })
    await expect(access(missingPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to clear a non-empty catalog after an empty scan', async () => {
    const path = join(temporaryDirectory.path, 'protected.json')
    const initial = '{"existing":"Translation"}'
    await writeFile(path, initial, 'utf8')

    await expect(
      syncCatalog({
        project: 'web',
        locale: 'en_US',
        path,
        keys: new Set(),
        clean: true,
      }),
    ).rejects.toBeInstanceOf(EmptyScanCleanError)
    expect(await readFile(path, 'utf8')).toBe(initial)
  })

  it('allows an intentional empty clean', async () => {
    const path = join(temporaryDirectory.path, 'allow-empty.json')
    await writeFile(path, '{"existing":"Translation"}\n', 'utf8')

    const report = await syncCatalog({
      project: 'web',
      locale: 'en_US',
      path,
      keys: new Set(),
      clean: true,
      allowEmpty: true,
    })

    expect(report.deleted).toEqual(['existing'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({})
  })

  it('rejects non-string catalog values without overwriting the file', async () => {
    const path = join(temporaryDirectory.path, 'nested.json')
    const initial = '{"valid":"Translation","nested":{"value":"Invalid"}}'
    await writeFile(path, initial, 'utf8')

    await expect(
      syncCatalog({
        project: 'web',
        locale: 'en_US',
        path,
        keys: new Set(['valid', 'new']),
      }),
    ).rejects.toBeInstanceOf(CatalogValidationError)
    expect(await readFile(path, 'utf8')).toBe(initial)
  })
})

describe('syncProject', () => {
  const temporaryDirectory = useTemporaryDirectory()

  it('validates every catalog before writing any catalog', async () => {
    const validPath = join(temporaryDirectory.path, 'valid.json')
    const invalidPath = join(temporaryDirectory.path, 'invalid.json')
    const validInitial = '{"existing":"Translation"}\n'
    const invalidInitial = '{ invalid json'
    await writeFile(validPath, validInitial, 'utf8')
    await writeFile(invalidPath, invalidInitial, 'utf8')

    await expect(
      syncProject({
        project: 'web',
        catalogs: {
          en_US: validPath,
          zh_CN: invalidPath,
        },
        keys: new Set(['existing', 'new']),
      }),
    ).rejects.toBeInstanceOf(CatalogValidationError)

    expect(await readFile(validPath, 'utf8')).toBe(validInitial)
    expect(await readFile(invalidPath, 'utf8')).toBe(invalidInitial)
  })
})
