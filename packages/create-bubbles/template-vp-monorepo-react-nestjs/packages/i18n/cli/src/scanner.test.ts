import { describe, expect, it } from 'vite-plus/test'

import { scanSource } from './scanner.ts'

describe('scanSource', () => {
  it('extracts Chinese text and all three static quote styles', () => {
    const source = ["tr('保存')", 'tr("Open")', 'tr(`用户`)'].join('\n')

    expect(scanSource(source)).toEqual([
      { key: '保存', index: 0, line: 1, column: 1 },
      { key: 'Open', index: 9, line: 2, column: 1 },
      { key: '用户', index: 20, line: 3, column: 1 },
    ])
  })

  it('allows whitespace and newlines around the first argument', () => {
    const source = ['const message = tr', '  (', "    '你好 {name}',", '    { name },', '  )'].join(
      '\n',
    )

    expect(scanSource(source)).toEqual([{ key: '你好 {name}', index: 16, line: 1, column: 17 }])
  })

  it('decodes common escapes without evaluating source code', () => {
    const source = String.raw`tr('It\'s\n中\t\x41\u6587\u{1F600}')`

    expect(scanSource(source).map(({ key }) => key)).toEqual(["It's\n中\tA文😀"])
  })

  it('allows escaped interpolation syntax in a static template', () => {
    const source = 'tr(`price: \\${value}`)'

    expect(scanSource(source).map(({ key }) => key)).toEqual(['price: ${value}'])
  })

  it('ignores dynamic arguments, concatenation, and template interpolation', () => {
    const source = [
      'tr(key)',
      'tr(getKey())',
      "tr('a' + value)",
      'tr(`hello ${name}`)',
      "tr('kept')",
    ].join('\n')

    expect(scanSource(source).map(({ key }) => key)).toEqual(['kept'])
  })

  it('requires an identifier boundary around the call name', () => {
    const source = [
      "notr('prefix')",
      "trailingtr('suffix')",
      "tr2('number')",
      "_tr('underscore')",
      "obj.tr('method')",
      "tr('direct')",
    ].join('\n')

    expect(scanSource(source).map(({ key }) => key)).toEqual(['method', 'direct'])
  })

  it('supports custom call names', () => {
    const source = ["t('short')", "$t('dollar')", "tr('default')"].join('\n')

    expect(scanSource(source, { callNames: ['t', '$t'] }).map(({ key }) => key)).toEqual([
      'short',
      'dollar',
    ])
  })

  it('returns every occurrence and leaves deduplication to the caller', () => {
    const source = "tr('same')\ntr('same')"

    expect(scanSource(source).map(({ key }) => key)).toEqual(['same', 'same'])
  })

  it('rejects a static string followed by an unexpected token', () => {
    const source = ["tr('plus' + value)", "tr('semicolon'; value)"].join('\n')

    expect(scanSource(source)).toEqual([])
  })
})
