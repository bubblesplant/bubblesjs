#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'

import { syncSourceKeys } from './lib/locales.mjs'
import { scanSource } from './lib/scanner.mjs'

const commands = new Set(['scan', 'excel:export', 'excel:import'])

const defaultOptions = {
  command: 'scan',
  source: 'apps/web/src',
  locales: 'apps/web/src/locales',
  excel: 'apps/web/i18n.xlsx',
  fn: ['tr'],
  dry: false,
  writeEmpty: false,
  checkPlaceholders: true,
  help: false,
}

function printHelp() {
  console.log(
    `
Usage:
  node apps/web/script/index.mjs [scan] [options]
  node apps/web/script/index.mjs excel:export [options]
  node apps/web/script/index.mjs excel:import [options]

Commands:
  scan           Scan source and add missing keys to every locale JSON (default)
  excel:export   Export locale JSON files to one Excel workbook
  excel:import   Import translations from Excel into locale JSON files

Common options:
  --locales <dir>   Locale JSON directory. Default: apps/web/src/locales
  --excel <file>    Excel file. Default: apps/web/i18n.xlsx
  --dry             Preview changes without writing JSON files
  -h, --help        Show help

Scan options:
  --source <dir>    Source directory. Default: apps/web/src
  --fn <names>      Function names, comma-separated. Default: tr

Import options:
  --write-empty              Write empty Excel cells as empty strings
  --no-check-placeholders    Do not validate placeholders such as {name}

Examples:
  node apps/web/script/index.mjs
  node apps/web/script/index.mjs scan --dry
  node apps/web/script/index.mjs excel:export
  node apps/web/script/index.mjs excel:import --dry
  node apps/web/script/index.mjs excel:import --excel tmp/translations.xlsx
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

function parseFunctionNames(value) {
  const names = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (names.length === 0) {
    throw new Error('--fn must contain at least one function name')
  }

  for (const name of names) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      throw new Error(`Unsupported function name: ${name}`)
    }
  }

  return names
}

function parseArgv(argv) {
  const options = { ...defaultOptions }
  let start = 0

  if (argv[0] && !argv[0].startsWith('-')) {
    if (!commands.has(argv[0])) {
      throw new Error(`Unknown command: ${argv[0]}`)
    }

    options.command = argv[0]
    start = 1
  }

  for (let i = start; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }

    if (arg === '--dry') {
      options.dry = true
      continue
    }

    if (arg === '--no-dry') {
      options.dry = false
      continue
    }

    if (arg === '--write-empty') {
      options.writeEmpty = true
      continue
    }

    if (arg === '--no-check-placeholders') {
      options.checkPlaceholders = false
      continue
    }

    const valueOptions = [
      ['--source', 'source'],
      ['--locales', 'locales'],
      ['--excel', 'excel'],
    ]
    let matchedValueOption = false

    for (const [name, key] of valueOptions) {
      if (arg.startsWith(`${name}=`)) {
        options[key] = arg.slice(name.length + 1)
        matchedValueOption = true
        break
      }

      if (arg === name) {
        const [value, nextIndex] = readOptionValue(argv, i, name)
        options[key] = value
        i = nextIndex
        matchedValueOption = true
        break
      }
    }

    if (matchedValueOption) continue

    if (arg.startsWith('--fn=')) {
      options.fn = parseFunctionNames(arg.slice('--fn='.length))
      continue
    }

    if (arg === '--fn') {
      const [value, nextIndex] = readOptionValue(argv, i, '--fn')
      options.fn = parseFunctionNames(value)
      i = nextIndex
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function readOptions() {
  const options = parseArgv(process.argv.slice(2))

  if (!options.source) throw new Error('--source cannot be empty')
  if (!options.locales) throw new Error('--locales cannot be empty')
  if (!options.excel) throw new Error('--excel cannot be empty')

  return options
}

function printGroupedKeys(title, items, cwd, marker) {
  console.log(title)

  if (items.length === 0) {
    console.log('- none')
    return
  }

  for (const item of items) {
    console.log(`- ${path.relative(cwd, item.file)}`)

    for (const key of item.keys) {
      console.log(`  ${marker} ${key}`)
    }
  }
}

function runScan(options, cwd) {
  const sourceDir = path.resolve(cwd, options.source)
  const localesDir = path.resolve(cwd, options.locales)
  const result = scanSource({
    sourceDir,
    localesDir,
    functionNames: options.fn,
  })
  const syncResult = syncSourceKeys({
    localesDir,
    keys: result.keys,
    dry: options.dry,
  })
  const dryPrefix = options.dry ? '[dry] ' : ''

  console.log(`${dryPrefix}found ${result.keys.size} keys in source`)
  console.log(`${dryPrefix}added ${syncResult.totalAdded} missing locale entries`)
  console.log(`${dryPrefix}found ${syncResult.totalUnused} locale entries not used in source`)
  console.log('')
  printGroupedKeys('Added entries:', syncResult.addedByFile, cwd, '+')
  console.log('')
  printGroupedKeys('Locale entries not found in source:', syncResult.unusedByFile, cwd, '-')

  if (result.skipped.length > 0) {
    console.log('')
    console.log(`Skipped ${result.skipped.length} non-static or empty calls:`)

    for (const item of result.skipped.slice(0, 10)) {
      console.log(
        `- ${path.relative(cwd, item.file)}:${item.line} ${item.callName}(...) (${item.reason})`,
      )
    }

    if (result.skipped.length > 10) {
      console.log(`- ...and ${result.skipped.length - 10} more`)
    }
  }
}

async function runExcelExport(options, cwd) {
  const { exportLocalesToExcel } = await import('./lib/excel.mjs')
  const result = await exportLocalesToExcel({
    localesDir: path.resolve(cwd, options.locales),
    excelFile: path.resolve(cwd, options.excel),
  })

  console.log(`exported ${result.keyCount} keys and ${result.localeCount} locales`)
  console.log(`file: ${path.relative(cwd, result.excelFile)}`)
}

function printImportStats(result, cwd, dry) {
  const prefix = dry ? '[dry] ' : ''

  console.log(`${prefix}read ${result.keyCount} keys from Excel`)
  for (const item of result.locales) {
    console.log(
      `- ${path.relative(cwd, item.file)}: ${item.added} added, ${item.updated} updated, ${item.unchanged} unchanged, ${item.emptyPreserved} empty preserved`,
    )
  }

  if (result.ignoredHeaders.length > 0) {
    console.log(`ignored columns: ${result.ignoredHeaders.join(', ')}`)
  }

  if (result.missingLocales.length > 0) {
    console.log(`locale files missing from Excel: ${result.missingLocales.join(', ')}`)
  }
}

async function runExcelImport(options, cwd) {
  const { importExcelToLocales } = await import('./lib/excel.mjs')
  const result = await importExcelToLocales({
    localesDir: path.resolve(cwd, options.locales),
    excelFile: path.resolve(cwd, options.excel),
    dry: options.dry,
    writeEmpty: options.writeEmpty,
    checkPlaceholders: options.checkPlaceholders,
  })

  printImportStats(result, cwd, options.dry)
}

async function main() {
  const options = readOptions()

  if (options.help) {
    printHelp()
    return
  }

  const cwd = process.cwd()

  if (options.command === 'scan') {
    runScan(options, cwd)
    return
  }

  if (options.command === 'excel:export') {
    await runExcelExport(options, cwd)
    return
  }

  await runExcelImport(options, cwd)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('Run with --help for usage.')
  process.exitCode = 1
}
