```javascript
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

const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx'])
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

  for (let i = 0; i < argv.length; i++) {
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

    if (arg.startsWith('--fn=')) {
      result.fn = arg.slice('--fn='.length)
      continue
    }

    if (arg === '--fn') {
      const [value, nextIndex] = readOptionValue(argv, i, '--fn')
      result.fn = value
      i = nextIndex
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return result
}

function formatZodError(error) {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'options'
      return `- ${field}: ${issue.message}`
    })
    .join('\n')
}

function readOptions() {
  let rawOptions

  try {
    rawOptions = parseArgv(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('Run with --help for usage.')
    process.exit(1)
  }

  const parsed = CliOptionsSchema.safeParse(rawOptions)

  if (!parsed.success) {
    console.error('Invalid options:')
    console.error(formatZodError(parsed.error))
    process.exit(1)
  }

  if (parsed.data.help) {
    printHelp()
    process.exit(0)
  }

  return parsed.data
}

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)

    if (item.isDirectory()) {
      if (skipDirs.has(item.name)) continue
      callback(fullPath, item)
      walk(fullPath, callback)
      continue
    }

    callback(fullPath, item)
  }
}

function getScriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (file.endsWith('.js')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function getLiteralText(node) {
  if (!node) return null

  if (ts.isStringLiteral(node)) {
    return node.text
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  return null
}

function getExpressionName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const left = getExpressionName(expression.expression)
    if (!left) return expression.name.text
    return `${left}.${expression.name.text}`
  }

  return null
}

function collectKeysFromFile(file, functionNames, keys, skipped) {
  const code = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(file),
  )

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callName = getExpressionName(node.expression)

      if (callName && functionNames.has(callName)) {
        const key = getLiteralText(node.arguments[0])

        if (key) {
          keys.add(key)
        } else {
          skipped.push({
            file,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            callName,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function readJson(file) {
  if (!fs.existsSync(file)) return {}

  const content = fs.readFileSync(file, 'utf8').trim()
  if (!content) return {}

  return JSON.parse(content)
}

function syncLocaleFile(file, keys, dry) {
  const json = readJson(file)
  let added = 0

  for (const key of keys) {
    if (!(key in json)) {
      json[key] = key
      added += 1
    }
  }

  if (added > 0 && !dry) {
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  }

  return added
}

function main() {
  const options = readOptions()
  const cwd = process.cwd()
  const sourceDir = path.resolve(cwd, options.source)
  const localesDir = path.resolve(cwd, options.locales)
  const functionNames = new Set(options.fn)
  const keys = new Set()
  const skipped = []

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`)
  }

  if (!fs.existsSync(localesDir)) {
    throw new Error(`Locales directory not found: ${localesDir}`)
  }

  walk(sourceDir, (fullPath, item) => {
    if (item.isDirectory()) return
    if (fullPath.startsWith(localesDir)) return
    if (!codeExts.has(path.extname(item.name))) return

    collectKeysFromFile(fullPath, functionNames, keys, skipped)
  })

  const localeFiles = fs
    .readdirSync(localesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(localesDir, file))

  if (localeFiles.length === 0) {
    throw new Error(`No locale JSON files found in: ${localesDir}`)
  }

  let totalAdded = 0

  for (const file of localeFiles) {
    const added = syncLocaleFile(file, keys, options.dry)
    totalAdded += added

    if (added > 0) {
      const prefix = options.dry ? '[dry] ' : ''
      console.log(`${prefix}${path.relative(cwd, file)} +${added}`)
    }
  }

  console.log(`found ${keys.size} keys, added ${totalAdded} entries`)

  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length} dynamic calls`)

    for (const item of skipped.slice(0, 10)) {
      console.log(`- ${path.relative(cwd, item.file)}:${item.line} ${item.callName}(...)`)
    }

    if (skipped.length > 10) {
      console.log(`- ...and ${skipped.length - 10} more`)
    }
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
```
