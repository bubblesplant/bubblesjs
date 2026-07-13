import fs from 'node:fs'
import path from 'node:path'

export function listLocaleFiles(localesDir) {
  if (!fs.existsSync(localesDir)) {
    throw new Error(`Locales directory not found: ${localesDir}`)
  }

  const files = fs
    .readdirSync(localesDir, { withFileTypes: true })
    .filter((item) => item.isFile() && path.extname(item.name).toLowerCase() === '.json')
    .map((item) => path.join(localesDir, item.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))

  if (files.length === 0) {
    throw new Error(`No locale JSON files found in: ${localesDir}`)
  }

  return files
}

export function readLocaleFile(file) {
  const content = fs.readFileSync(file, 'utf8').trim()
  if (!content) return {}

  let json
  try {
    json = JSON.parse(content)
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!json || Array.isArray(json) || typeof json !== 'object') {
    throw new Error(`Locale file must contain a flat JSON object: ${file}`)
  }

  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== 'string') {
      throw new Error(`Locale value must be a string: ${file} -> ${key}`)
    }
  }

  return json
}

export function writeLocaleFile(file, json) {
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
}

export function localeNameFromFile(file) {
  return path.basename(file, path.extname(file))
}

export function loadLocales(localesDir) {
  return listLocaleFiles(localesDir).map((file) => ({
    file,
    name: localeNameFromFile(file),
    messages: readLocaleFile(file),
  }))
}

export function syncSourceKeys({ localesDir, keys, dry = false }) {
  const locales = loadLocales(localesDir)
  const addedByFile = []
  const unusedByFile = []
  let totalAdded = 0
  let totalUnused = 0

  for (const locale of locales) {
    const added = []

    for (const key of keys) {
      if (!(key in locale.messages)) {
        locale.messages[key] = key
        added.push(key)
      }
    }

    const unused = Object.keys(locale.messages).filter((key) => !keys.has(key))
    totalAdded += added.length
    totalUnused += unused.length

    if (added.length > 0) {
      addedByFile.push({ file: locale.file, keys: added })
      if (!dry) writeLocaleFile(locale.file, locale.messages)
    }

    if (unused.length > 0) unusedByFile.push({ file: locale.file, keys: unused })
  }

  return { addedByFile, unusedByFile, totalAdded, totalUnused }
}
