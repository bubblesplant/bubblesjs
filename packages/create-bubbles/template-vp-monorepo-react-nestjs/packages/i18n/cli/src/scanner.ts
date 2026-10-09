export interface MessageOccurrence {
  key: string
  index: number
  line: number
  column: number
}

export interface ScanOptions {
  callNames?: readonly string[]
}

interface ParsedString {
  value: string
  endIndex: number
}

interface ParsedEscape {
  value: string
  nextIndex: number
}

const identifierContinuePattern = /[\p{ID_Continue}_$]/u
const whitespacePattern = /\s/u
const lineTerminatorPattern = /[\n\r\u2028\u2029]/u
const hexPattern = /^[\dA-Fa-f]+$/

/** 扫描文本中的翻译调用及其静态字符串参数，允许调用边界的空白与注释；返回原始源码行列位置，跳过插值模板和动态表达式。 */
export function scanSource(source: string, options: ScanOptions = {}): MessageOccurrence[] {
  const callNames = normalizeCallNames(options.callNames)
  const occurrences: MessageOccurrence[] = []

  if (callNames.length === 0) {
    return occurrences
  }

  const lineStarts = collectLineStarts(source)

  for (let index = 0; index < source.length; index += 1) {
    for (const callName of callNames) {
      if (!source.startsWith(callName, index)) {
        continue
      }

      if (!hasIdentifierBoundaries(source, index, callName)) {
        continue
      }

      let cursor = skipWhitespaceAndComments(source, index + callName.length)
      if (source[cursor] !== '(') {
        continue
      }

      cursor = skipWhitespaceAndComments(source, cursor + 1)
      const quote = source[cursor]
      if (quote !== "'" && quote !== '"' && quote !== '`') {
        continue
      }

      const parsed = parseString(source, cursor, quote)
      if (!parsed) {
        continue
      }

      const nextTokenIndex = skipWhitespaceAndComments(source, parsed.endIndex)
      const nextToken = source[nextTokenIndex]
      if (nextToken !== ',' && nextToken !== ')') {
        continue
      }

      const position = locatePosition(lineStarts, index)
      occurrences.push({
        key: parsed.value,
        index,
        line: position.line,
        column: position.column,
      })

      index += callName.length - 1
      break
    }
  }

  return occurrences
}

/** 去除空调用名和重复项，并优先匹配更长的名称；未配置时使用 tr。 */
function normalizeCallNames(callNames: readonly string[] | undefined): string[] {
  const names = callNames ?? ['tr']
  return [...new Set(names.filter((name) => name.length > 0))].sort(
    (left, right) => right.length - left.length,
  )
}

/** 检查候选调用名的两侧，避免把较长标识符中的片段识别为翻译函数。 */
function hasIdentifierBoundaries(source: string, index: number, callName: string): boolean {
  const firstCharacter = callName[0]
  const lastCharacter = callName[callName.length - 1]

  if (isIdentifierContinue(firstCharacter) && isIdentifierContinue(source[index - 1])) {
    return false
  }

  return !(
    isIdentifierContinue(lastCharacter) && isIdentifierContinue(source[index + callName.length])
  )
}

/** 判断字符是否可以继续组成 JavaScript 标识符，兼容 Unicode 连接字符。 */
function isIdentifierContinue(character: string | undefined): boolean {
  return (
    character !== undefined &&
    (identifierContinuePattern.test(character) ||
      character === '\u{200C}' ||
      character === '\u{200D}')
  )
}

/** 跳过调用边界的空白、行注释和块注释；未闭合块注释返回源码末尾，使当前候选匹配失败。 */
function skipWhitespaceAndComments(source: string, startIndex: number): number {
  let index = startIndex
  while (index < source.length) {
    if (whitespacePattern.test(source[index] ?? '')) {
      index += 1
      continue
    }

    if (source.startsWith('//', index)) {
      index += 2
      while (index < source.length && !lineTerminatorPattern.test(source[index] ?? '')) {
        index += 1
      }
      continue
    }

    if (source.startsWith('/*', index)) {
      const closingIndex = source.indexOf('*/', index + 2)
      if (closingIndex === -1) {
        return source.length
      }
      index = closingIndex + 2
      continue
    }

    break
  }
  return index
}

/** 解析引号包裹的静态词条并还原转义；未闭合、非法换行或包含模板插值时返回 undefined。 */
function parseString(
  source: string,
  startIndex: number,
  quote: "'" | '"' | '`',
): ParsedString | undefined {
  let value = ''

  for (let index = startIndex + 1; index < source.length;) {
    const character = source[index]

    if (character === quote) {
      return { value, endIndex: index + 1 }
    }

    if (character === '\\') {
      const escape = parseEscape(source, index)
      if (!escape) {
        return undefined
      }
      value += escape.value
      index = escape.nextIndex
      continue
    }

    if (quote === '`' && character === '$' && source[index + 1] === '{') {
      return undefined
    }

    if (quote !== '`' && (character === '\n' || character === '\r')) {
      return undefined
    }

    value += character
    index += 1
  }

  return undefined
}

/** 解析反斜杠后的字符转义、续行和 Unicode 转义，返回解码结果与后续扫描位置。 */
function parseEscape(source: string, slashIndex: number): ParsedEscape | undefined {
  const escaped = source[slashIndex + 1]
  if (escaped === undefined) {
    return undefined
  }

  const simpleEscapes: Readonly<Record<string, string>> = {
    "'": "'",
    '"': '"',
    '`': '`',
    '\\': '\\',
    $: '$',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    0: '\0',
  }

  if (escaped in simpleEscapes) {
    return {
      value: simpleEscapes[escaped] ?? '',
      nextIndex: slashIndex + 2,
    }
  }

  if (escaped === '\n') {
    return { value: '', nextIndex: slashIndex + 2 }
  }

  if (escaped === '\r') {
    const nextIndex = source[slashIndex + 2] === '\n' ? slashIndex + 3 : slashIndex + 2
    return { value: '', nextIndex }
  }

  if (escaped === 'x') {
    return parseFixedHexEscape(source, slashIndex, 2, 2)
  }

  if (escaped === 'u') {
    if (source[slashIndex + 2] === '{') {
      return parseCodePointEscape(source, slashIndex)
    }
    return parseFixedHexEscape(source, slashIndex, 2, 4)
  }

  return { value: escaped, nextIndex: slashIndex + 2 }
}

/** 解码指定长度的十六进制转义；位数不足或包含非十六进制字符时返回 undefined。 */
function parseFixedHexEscape(
  source: string,
  slashIndex: number,
  prefixLength: number,
  digitCount: number,
): ParsedEscape | undefined {
  const digitsStart = slashIndex + prefixLength
  const digits = source.slice(digitsStart, digitsStart + digitCount)
  if (digits.length !== digitCount || !hexPattern.test(digits)) {
    return undefined
  }

  return {
    value: String.fromCodePoint(Number.parseInt(digits, 16)),
    nextIndex: digitsStart + digitCount,
  }
}

/** 解码花括号包裹的 Unicode 码点，并拒绝缺失括号或超出 Unicode 范围的值。 */
function parseCodePointEscape(source: string, slashIndex: number): ParsedEscape | undefined {
  const digitsStart = slashIndex + 3
  const closingBraceIndex = source.indexOf('}', digitsStart)
  if (closingBraceIndex === -1) {
    return undefined
  }

  const digits = source.slice(digitsStart, closingBraceIndex)
  if (digits.length === 0 || digits.length > 6 || !hexPattern.test(digits)) {
    return undefined
  }

  const codePoint = Number.parseInt(digits, 16)
  if (codePoint > 0x10_ff_ff) {
    return undefined
  }

  return {
    value: String.fromCodePoint(codePoint),
    nextIndex: closingBraceIndex + 1,
  }
}

/** 收集每行起始偏移，兼容 LF、CRLF、CR 以及 Unicode 行和段落分隔符。 */
function collectLineStarts(source: string): number[] {
  const starts = [0]

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n') {
        index += 1
      }
      starts.push(index + 1)
    } else if (lineTerminatorPattern.test(source[index] ?? '')) {
      starts.push(index + 1)
    }
  }

  return starts
}

/** 使用二分查找将字符偏移转换为从 1 开始的行号与列号。 */
function locatePosition(
  lineStarts: readonly number[],
  index: number,
): { line: number; column: number } {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const lineStart = lineStarts[middle] ?? 0

    if (lineStart <= index) {
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  const lineIndex = Math.max(0, high)
  const lineStart = lineStarts[lineIndex] ?? 0
  return { line: lineIndex + 1, column: index - lineStart + 1 }
}
