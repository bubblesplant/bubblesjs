import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { createSyncReport, writeSyncReport } from '../src/report.ts'
import { useTemporaryDirectory } from './temporary-directory.ts'

describe('sync report', () => {
  const temporaryDirectory = useTemporaryDirectory()

  it('writes the flat report format', async () => {
    const report = createSyncReport({
      clean: false,
      dryRun: true,
      files: [
        {
          project: 'web',
          path: 'apps/web/src/locales/en_US.json',
          locale: 'en_US',
          added: ['用户'],
          unused: ['旧文案'],
          deleted: [],
          unchangedCount: 2,
        },
      ],
    })
    const path = join(temporaryDirectory.path, 'reports', 'i18n.json')

    await writeSyncReport(report, path)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      command: 'sync',
      clean: false,
      dryRun: true,
      files: [
        {
          project: 'web',
          path: 'apps/web/src/locales/en_US.json',
          locale: 'en_US',
          added: ['用户'],
          unused: ['旧文案'],
          deleted: [],
          unchangedCount: 2,
        },
      ],
    })
  })

  it('writes a check report', async () => {
    const report = createSyncReport({ command: 'check' })
    const path = join(temporaryDirectory.path, 'reports', 'i18n-check.json')

    await writeSyncReport(report, path)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      command: 'check',
      clean: false,
      dryRun: false,
      files: [],
    })
  })
})
