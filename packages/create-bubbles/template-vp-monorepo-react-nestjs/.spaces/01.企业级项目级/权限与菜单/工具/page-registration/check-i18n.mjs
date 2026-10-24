import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, scanFiles } from '@bubblesjs/i18n-cli'
import { ACCESS_PAGE_CATALOG } from '../../../../../packages/shared/dist/utils.js'

const projectRoot = fileURLToPath(new URL('../../../../../', import.meta.url))
const { rootDir, config } = await loadConfig({ cwd: projectRoot })
const project = config.projects.web
const scan = await scanFiles({
  rootDir,
  include: project.include,
  exclude: project.exclude,
  callNames: config.callNames,
})
const catalogPath = resolve(rootDir, 'packages/shared/src/utils/access-catalog.ts')
const sourceIncluded = scan.files.some((file) => resolve(file) === catalogPath)
const scannedTitles = new Set(
  scan.occurrences.filter((entry) => resolve(entry.file) === catalogPath).map((entry) => entry.key),
)
const titles = [...new Set(ACCESS_PAGE_CATALOG.map((page) => page.title))]
const uncollectedTitles = titles.filter((title) => !scannedTitles.has(title))
const missingTranslations = {}

for (const [locale, catalogFile] of Object.entries(project.catalogs)) {
  const messages = JSON.parse(await readFile(resolve(rootDir, catalogFile), 'utf8'))
  missingTranslations[locale] = titles.filter((title) => !Object.hasOwn(messages, title))
}

console.log(
  JSON.stringify(
    {
      pageCount: ACCESS_PAGE_CATALOG.length,
      uniqueTitleCount: titles.length,
      sourceIncluded,
      uncollectedTitles,
      missingTranslations,
    },
    null,
    2,
  ),
)
assert.equal(sourceIncluded, true, 'Web 扫描必须包含共享页面目录')
assert.deepEqual(uncollectedTitles, [], '所有共享页面标题必须被静态采集')
for (const [locale, missing] of Object.entries(missingTranslations)) {
  assert.deepEqual(missing, [], `${locale} 必须包含全部共享页面标题`)
}
