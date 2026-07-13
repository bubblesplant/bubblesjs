import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import ExcelJS from 'exceljs'
import { afterEach, expect, test } from 'vite-plus/test'

import { exportLocalesToExcel, importExcelToLocales } from './lib/excel.mjs'
import { scanCode } from './lib/scanner.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('JavaScript scanner collects static calls and ignores comments, strings, and properties', () => {
  const code = [
    `tr('保存')`,
    `tr("\\u4F60\\u597D", { name: '小红' })`,
    `const text = "tr('普通字符串')"`,
    `// tr('行注释')`,
    `/* tr('块注释') */`,
    `const matcher = /tr\\('正则字面量'\\)/`,
    `i18n.tr('对象方法')`,
    `tr(dynamicKey)`,
    `tr('拼接' + suffix)`,
    "const value = `prefix ${tr('模板表达式')}`",
  ].join('\n')

  const result = scanCode({ code, ext: '.tsx', file: 'example.tsx' })

  expect([...result.keys]).toEqual(['保存', '你好', '模板表达式'])
  expect(result.skipped).toHaveLength(2)
})

test('Vue scanner reads script and template expressions without scanning plain attributes', () => {
  const code = `
<template>
  <div title="tr('普通属性')" :title="tr('动态属性')" @click="tr('点击')">
    {{ tr('插值') }}
  </div>
</template>
<script setup>
const note = "tr('脚本字符串')"
tr('脚本调用')
</script>
`

  const result = scanCode({ code, ext: '.vue', file: 'Example.vue' })

  expect([...result.keys]).toEqual(['脚本调用', '插值', '动态属性', '点击'])
})

test('Svelte and Astro scanners read script/frontmatter and brace expressions', () => {
  const svelte = scanCode({
    code: `<script>tr('Svelte脚本')</script><div title="tr('普通属性')">{tr('Svelte表达式')}</div>`,
    ext: '.svelte',
    file: 'Example.svelte',
  })
  const astro = scanCode({
    code: `---\ntr('Astro前置')\n---\n<div>{tr('Astro表达式')}</div>`,
    ext: '.astro',
    file: 'Example.astro',
  })

  expect([...svelte.keys]).toEqual(['Svelte脚本', 'Svelte表达式'])
  expect([...astro.keys]).toEqual(['Astro前置', 'Astro表达式'])
})

test('Excel export and import round-trip locale JSON safely', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sync-'))
  temporaryDirectories.push(root)

  const localesDir = path.join(root, 'locales')
  const excelFile = path.join(root, 'i18n.xlsx')
  fs.mkdirSync(localesDir)
  fs.writeFileSync(
    path.join(localesDir, 'en_US.json'),
    `${JSON.stringify({ 保存: 'Save', '你好 {name}': 'Hello {name}' }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(localesDir, 'zh_CN.json'),
    `${JSON.stringify({ 保存: '保存', '你好 {name}': '你好 {name}' }, null, 2)}\n`,
  )

  const exported = await exportLocalesToExcel({ localesDir, excelFile })
  expect({ keys: exported.keyCount, locales: exported.localeCount }).toEqual({
    keys: 2,
    locales: 2,
  })

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(excelFile)
  const worksheet = workbook.getWorksheet('Translations')
  expect(worksheet.actualColumnCount).toBe(3)
  expect(worksheet.getCell('A1').fill.fgColor.argb).toBe('FF176B66')
  expect(worksheet.getCell('A1').font.color.argb).toBe('FFFFFFFF')
  expect(worksheet.getCell('A2').fill.fgColor.argb).toBe('FFF3F4F6')
  const headers = Object.fromEntries(
    worksheet
      .getRow(1)
      .values.slice(1)
      .map((value, index) => [String(value), index + 1]),
  )
  const saveRow = worksheet.getColumn(headers.key).values.findIndex((value) => value === '保存')
  worksheet.getRow(saveRow).getCell(headers.en_US).value = 'Store'
  worksheet.getRow(saveRow).getCell(headers.zh_CN).value = ''
  const addedRow = worksheet.addRow([])
  addedRow.getCell(headers.key).value = '新增 {count}'
  addedRow.getCell(headers.en_US).value = 'Added {count}'
  addedRow.getCell(headers.zh_CN).value = ''
  await workbook.xlsx.writeFile(excelFile)

  const imported = await importExcelToLocales({ localesDir, excelFile })
  expect(imported.keyCount).toBe(3)

  const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en_US.json'), 'utf8'))
  const zh = JSON.parse(fs.readFileSync(path.join(localesDir, 'zh_CN.json'), 'utf8'))
  expect(en['保存']).toBe('Store')
  expect(zh['保存']).toBe('保存')
  expect(en['新增 {count}']).toBe('Added {count}')
  expect(zh['新增 {count}']).toBe('新增 {count}')
})

test('Excel import rejects translations that lose placeholders', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-placeholders-'))
  temporaryDirectories.push(root)

  const localesDir = path.join(root, 'locales')
  const excelFile = path.join(root, 'i18n.xlsx')
  fs.mkdirSync(localesDir)
  fs.writeFileSync(
    path.join(localesDir, 'en_US.json'),
    `${JSON.stringify({ '你好 {name}': 'Hello {name}' }, null, 2)}\n`,
  )

  await exportLocalesToExcel({ localesDir, excelFile })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(excelFile)
  workbook.getWorksheet('Translations').getCell('B2').value = 'Hello'
  await workbook.xlsx.writeFile(excelFile)

  await expect(importExcelToLocales({ localesDir, excelFile })).rejects.toThrow(
    /Placeholder validation failed/,
  )
})
