import { readFile } from 'node:fs/promises'

import fg from 'fast-glob'

import { scanSource, type MessageOccurrence } from './scanner.ts'

export interface LocatedMessageOccurrence extends MessageOccurrence {
  file: string
}

export interface ScanFilesOptions {
  rootDir: string
  include: readonly string[]
  exclude?: readonly string[]
  callNames?: readonly string[]
}

export interface ScanFilesResult {
  files: string[]
  keys: Set<string>
  occurrences: LocatedMessageOccurrence[]
  skippedBinaryFiles: string[]
}

const defaultExcludes = [
  '**/.git/**',
  '**/.pnpm-store/**',
  '**/.vite/**',
  '**/build/**',
  '**/coverage/**',
  '**/dist/**',
  '**/node_modules/**',
]

export async function scanFiles(options: ScanFilesOptions): Promise<ScanFilesResult> {
  const files = await fg([...options.include], {
    absolute: true,
    cwd: options.rootDir,
    dot: true,
    followSymbolicLinks: false,
    ignore: [...defaultExcludes, ...(options.exclude ?? [])],
    onlyFiles: true,
    unique: true,
  })

  files.sort((left, right) => left.localeCompare(right))

  const keys = new Set<string>()
  const occurrences: LocatedMessageOccurrence[] = []
  const skippedBinaryFiles: string[] = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (source.includes('\0')) {
      skippedBinaryFiles.push(file)
      continue
    }

    const normalizedSource = source.charCodeAt(0) === 0xfe_ff ? source.slice(1) : source
    for (const occurrence of scanSource(normalizedSource, { callNames: options.callNames })) {
      keys.add(occurrence.key)
      occurrences.push({ ...occurrence, file })
    }
  }

  return { files, keys, occurrences, skippedBinaryFiles }
}
