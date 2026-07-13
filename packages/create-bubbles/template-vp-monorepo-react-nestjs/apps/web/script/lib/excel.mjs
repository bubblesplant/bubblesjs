import fs from 'node:fs'
import path from 'node:path'

import ExcelJS from 'exceljs'

import { loadLocales, writeLocaleFile } from './locales.mjs'

const sheetName = 'Translations'

function collectKeys(locales) {
  const keys = new Set()
  for (const locale of locales) {
    for (const key of Object.keys(locale.messages)) keys.add(key)
  }
  return [...keys]
}

function columnWidth(values, minimum, maximum) {
  const longest = values.reduce((length, value) => Math.max(length, String(value).length), 0)
  return Math.max(minimum, Math.min(maximum, longest + 3))
}

function styleWorksheet(worksheet, locales, keys) {
  const header = worksheet.getRow(1)
  header.height = 28
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B66' } }
  header.alignment = { vertical: 'middle', horizontal: 'left' }
  header.border = { bottom: { style: 'medium', color: { argb: 'FF0F4C47' } } }

  worksheet.getColumn(1).width = columnWidth(['key', ...keys], 24, 48)

  locales.forEach((locale, index) => {
    const values = keys.map((key) => locale.messages[key] ?? '')
    worksheet.getColumn(index + 2).width = columnWidth([locale.name, ...values], 18, 42)
  })

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    row.height = 24
    row.getCell(1).font = { color: { argb: 'FF1F2937' } }
    row.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    }

    for (let column = 1; column <= locales.length + 1; column++) {
      const cell = row.getCell(column)
      cell.alignment = { vertical: 'top', wrapText: true }

      if (column > 1 && cell.value === '') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } }
      }
    }
  }

  worksheet.getCell('A1').note =
    'Stable translation key. Keep this column unchanged; edit locale columns only.'
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: locales.length + 1 },
  }
}

export async function exportLocalesToExcel({ localesDir, excelFile }) {
  const locales = loadLocales(localesDir)
  const keys = collectKeys(locales)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'i18n-sync'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1, showGridLines: false }],
  })

  worksheet.columns = [
    { header: 'key', key: 'key' },
    ...locales.map((locale) => ({ header: locale.name, key: locale.name })),
  ]

  for (const key of keys) {
    const row = { key }
    for (const locale of locales) row[locale.name] = locale.messages[key] ?? ''
    worksheet.addRow(row)
  }

  styleWorksheet(worksheet, locales, keys)
  fs.mkdirSync(path.dirname(excelFile), { recursive: true })
  await workbook.xlsx.writeFile(excelFile)

  return { excelFile, keyCount: keys.length, localeCount: locales.length }
}

function cellText(cell) {
  return cell.text
}

function placeholders(value) {
  return new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function validatePlaceholders(key, value, locale, rowNumber) {
  const expected = placeholders(key)
  const actual = placeholders(value)
  if (sameSet(expected, actual)) return null

  return `row ${rowNumber}, ${locale}, key "${key}": expected {${[...expected].join('}, {')}}, got {${[...actual].join('}, {')}}`
}

function readHeaders(worksheet) {
  const headers = new Map()
  const duplicates = []

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const name = cellText(cell).trim()
    if (!name) return
    if (headers.has(name)) duplicates.push(name)
    else headers.set(name, columnNumber)
  })

  if (duplicates.length > 0) {
    throw new Error(`Duplicate Excel columns: ${[...new Set(duplicates)].join(', ')}`)
  }

  if (!headers.has('key')) {
    throw new Error('Excel sheet must contain a "key" column')
  }

  return headers
}

function applyTranslation(messages, key, value, writeEmpty, stats) {
  const exists = Object.hasOwn(messages, key)

  if (!value && !writeEmpty) {
    if (exists) {
      stats.emptyPreserved += 1
      return
    }

    messages[key] = key
    stats.added += 1
    return
  }

  if (!exists) {
    messages[key] = value
    stats.added += 1
  } else if (messages[key] !== value) {
    messages[key] = value
    stats.updated += 1
  } else {
    stats.unchanged += 1
  }
}

export async function importExcelToLocales({
  localesDir,
  excelFile,
  dry = false,
  writeEmpty = false,
  checkPlaceholders = true,
}) {
  if (!fs.existsSync(excelFile)) {
    throw new Error(`Excel file not found: ${excelFile}`)
  }

  const locales = loadLocales(localesDir)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(excelFile)

  const worksheet = workbook.getWorksheet(sheetName) ?? workbook.worksheets[0]
  if (!worksheet) throw new Error('Excel workbook does not contain a worksheet')

  const headers = readHeaders(worksheet)
  const localeColumns = locales
    .filter((locale) => headers.has(locale.name))
    .map((locale) => ({ ...locale, column: headers.get(locale.name) }))

  if (localeColumns.length === 0) {
    throw new Error('Excel does not contain a column matching any locale JSON filename')
  }

  const localeNames = new Set(locales.map((locale) => locale.name))
  const ignoredHeaders = [...headers.keys()].filter(
    (header) => header !== 'key' && !localeNames.has(header),
  )
  const missingLocales = locales
    .filter((locale) => !headers.has(locale.name))
    .map((locale) => locale.name)
  const seenKeys = new Map()
  const placeholderErrors = []
  const keyColumn = headers.get('key')

  for (const locale of localeColumns) {
    locale.stats = { added: 0, updated: 0, unchanged: 0, emptyPreserved: 0 }
  }

  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber++) {
    const key = cellText(worksheet.getRow(rowNumber).getCell(keyColumn)).trim()
    if (!key) continue

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate key "${key}" in Excel rows ${seenKeys.get(key)} and ${rowNumber}`)
    }
    seenKeys.set(key, rowNumber)

    for (const locale of localeColumns) {
      const value = cellText(worksheet.getRow(rowNumber).getCell(locale.column))

      if (value && checkPlaceholders) {
        const error = validatePlaceholders(key, value, locale.name, rowNumber)
        if (error) placeholderErrors.push(error)
      }

      applyTranslation(locale.messages, key, value, writeEmpty, locale.stats)
    }
  }

  if (placeholderErrors.length > 0) {
    const visible = placeholderErrors
      .slice(0, 10)
      .map((item) => `- ${item}`)
      .join('\n')
    const remaining =
      placeholderErrors.length > 10 ? `\n- ...and ${placeholderErrors.length - 10} more` : ''
    throw new Error(`Placeholder validation failed:\n${visible}${remaining}`)
  }

  if (!dry) {
    for (const locale of localeColumns) {
      if (locale.stats.added > 0 || locale.stats.updated > 0) {
        writeLocaleFile(locale.file, locale.messages)
      }
    }
  }

  return {
    keyCount: seenKeys.size,
    ignoredHeaders,
    missingLocales,
    locales: localeColumns.map((locale) => ({
      file: locale.file,
      ...locale.stats,
    })),
  }
}
