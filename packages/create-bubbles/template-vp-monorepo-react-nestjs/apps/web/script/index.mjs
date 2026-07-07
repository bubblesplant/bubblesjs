#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { z } from 'zod'

const CliOptionsSchema = z.object({
  source: z.string().min(1, '--source cannot be empty').default('apps/web/src'),
  locales: z.string().min(1, '--locales cannot be empty').default('apps/web/src/locales'),
  fn: z
    .string()
    .min(1, '--fn cannot be empty')
    .default('t')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1, '--fn must contain at least one function name')),
  dry: z.boolean().default(false),
  help: z.boolean().default(false),
})

const codeExts = new Set(['ts', 'tsx', 'js', 'jsx'])
const skipDirs = new Set(['node_modules', 'dist', 'build', '.git'])

function printHelp() {
  console.log(
    `
Usage:
  i18n-sync [options]

Options:
  --source <dir>    Source directory to scan. Default: apps/web/src
  --locales <dir>   Locale JSON directory. Default: apps/web/src/locales
  --fn <names>      Function names, comma-separated. Default: t
                   Examples: t or t,i18n.t
  --dry             Preview changes without writing files
  -h, --help        Show help

Examples:
  i18n-sync
  i18n-sync --source src --locales src/locales
  i18n-sync --fn t,i18n.t --dry
`.trim(),
  )
}

function readOptionValue(argv, index, name) {
  const value = argv[index + 1]
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${name}`)
  }

  return [value, index + 1]
}

function parseArgv(argv) {
  const result = {}

  for (let i = 0, length = argv.length; i < length; i++) {
    const arg = argv[i]

    if (arg === '-h' || arg === '--help') {
      result.help = true
      continue
    }

    if (arg === '--dry') {
      result.dry = true
      continue
    }

    if (arg === '--no-dry') {
      result.dry = false
      continue
    }

    if (arg.startsWith('--source=')) {
      result.source = arg.slice('--source='.length)
      continue
    }

    if (arg === '--source') {
      const [value, nextIndex] = readOptionValue(argv, i, '--source')
      result.source = value
      i = nextIndex
      continue
    }

    if (arg.startsWith('--locales=')) {
      result.locales = arg.slice('--locales='.length)
      continue
    }

    if (arg === '--locales') {
      const [value, nextIndex] = readOptionValue(argv, i, '--locales')
      result.locales = value
      i = nextIndex
      continue
    }

    if (arg === '--locales') {
      const [value, nextIndex] = readOptionValue(argv, i, '--locales')
      result.locales = value
      i = nextIndex
      continue
    }
  }
}
