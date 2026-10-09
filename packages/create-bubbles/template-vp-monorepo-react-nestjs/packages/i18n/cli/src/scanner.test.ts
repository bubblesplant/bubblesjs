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

  it.each([
    { boundary: 'call name', source: "tr/* 调用说明 */('保存')" },
    { boundary: 'opening parenthesis', source: "tr(/* 参数说明 */ '保存')" },
    { boundary: 'closing parenthesis', source: "tr('保存' /* 词条说明 */)" },
    { boundary: 'comma', source: "tr('保存' /* 词条说明 */, { name })" },
    {
      boundary: 'adjacent mixed comments',
      source: [
        'tr/**/// 调用说明',
        '(/* 参数说明 */ /**/ // 参数说明',
        "  '保存' /**/ // 词条说明",
        '  /* 词条说明 */)',
      ].join('\n'),
    },
  ])('allows comments at the $boundary boundary', ({ source }) => {
    expect(scanSource(source)).toEqual([{ key: '保存', index: 0, line: 1, column: 1 }])
  })

  it.each([
    { name: 'LF', lineEnding: '\n' },
    { name: 'CR', lineEnding: '\r' },
    { name: 'CRLF', lineEnding: '\r\n' },
    { name: 'U+2028', lineEnding: '\u2028' },
    { name: 'U+2029', lineEnding: '\u2029' },
  ])('ends line comments at $name and preserves source positions', ({ lineEnding }) => {
    const source = [
      'tr // 调用说明',
      '  (// 参数说明',
      "    'first' // 词条说明",
      '  )',
      "  tr('next')",
    ].join(lineEnding)

    expect(scanSource(source)).toEqual([
      { key: 'first', index: 0, line: 1, column: 1 },
      { key: 'next', index: source.indexOf("tr('next')"), line: 5, column: 3 },
    ])
  })

  it('preserves comment markers inside static strings', () => {
    const source = [
      "tr('https://example.test/path/*说明*/')",
      'tr("/* 开头 */ // 结尾")',
      'tr(`// 第一行\n/* 第二行 */`)',
    ].join('\n')

    expect(scanSource(source).map(({ key }) => key)).toEqual([
      'https://example.test/path/*说明*/',
      '/* 开头 */ // 结尾',
      '// 第一行\n/* 第二行 */',
    ])
  })

  it('continues extracting complete calls inside comments and ordinary strings', () => {
    const source = [
      "// tr('行注释')",
      "/* tr('块注释') */",
      'const example = "tr(\'字符串\')"',
    ].join('\r\n')

    expect(scanSource(source)).toEqual([
      { key: '行注释', index: 3, line: 1, column: 4 },
      { key: '块注释', index: source.indexOf("tr('块注释')"), line: 2, column: 4 },
      { key: '字符串', index: source.indexOf("tr('字符串')"), line: 3, column: 18 },
    ])
  })

  it('still rejects dynamic expressions around comments', () => {
    const source = [
      'tr(/* 参数说明 */ key)',
      "tr('a' /* 词条说明 */ + value)",
      "tr('a' // 词条说明\n + value)",
      "tr('a' /* 词条说明 */.trim())",
      "tr('a' /* 词条说明 */ / divisor)",
      'tr(`hello ${name}` /* 词条说明 */)',
    ].join('\n')

    expect(scanSource(source)).toEqual([])
  })

  it.each([
    { boundary: 'call name', source: "tr/* 调用说明 ('保存')" },
    { boundary: 'opening parenthesis', source: "tr(/* 参数说明 '保存')" },
    { boundary: 'static string', source: "tr('保存' /* 词条说明)" },
  ])('rejects an unterminated block comment after the $boundary', ({ source }) => {
    expect(scanSource(source)).toEqual([])
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
