import { randomUUID } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export interface SyncFileReport {
  project: string
  path: string
  locale: string
  added: string[]
  unused: string[]
  deleted: string[]
  unchangedCount: number
}

export interface SyncReport {
  command: 'sync' | 'check'
  clean: boolean
  dryRun: boolean
  files: SyncFileReport[]
}

export interface CreateSyncReportOptions {
  command?: SyncReport['command']
  clean?: boolean
  dryRun?: boolean
  files?: readonly SyncFileReport[]
}

export function createSyncReport(options: CreateSyncReportOptions = {}): SyncReport {
  return {
    command: options.command ?? 'sync',
    clean: options.clean ?? false,
    dryRun: options.dryRun ?? false,
    files: (options.files ?? []).map((file) => ({
      ...file,
      added: [...file.added],
      unused: [...file.unused],
      deleted: [...file.deleted],
    })),
  }
}

export async function writeSyncReport(report: SyncReport, path: string): Promise<void> {
  const content = `${JSON.stringify(report, undefined, 2)}\n`
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
