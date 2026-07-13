import fs from 'node:fs'
import path from 'node:path'

export const codeExts = new Set([
  '.astro',
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
])

const markupExts = new Set(['.astro', '.svelte', '.vue'])
const skipDirs = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules'])
const regexPrefixKeywords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
])

function isIdentifierStart(char) {
  return Boolean(char) && /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char) {
  return Boolean(char) && /[\w$]/.test(char)
}

function decodeEscape(code, index) {
  const char = code[index + 1]
  if (char === undefined) return null

  const simpleEscapes = {
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    0: '\0',
  }

  if (char in simpleEscapes) {
    return { value: simpleEscapes[char], end: index + 2 }
  }

  if (char === '\n') return { value: '', end: index + 2 }
  if (char === '\r') {
    return { value: '', end: code[index + 2] === '\n' ? index + 3 : index + 2 }
  }

  if (char === 'x') {
    const hex = code.slice(index + 2, index + 4)
    if (/^[\dA-Fa-f]{2}$/.test(hex)) {
      return { value: String.fromCharCode(Number.parseInt(hex, 16)), end: index + 4 }
    }
  }

  if (char === 'u' && code[index + 2] === '{') {
    const close = code.indexOf('}', index + 3)
    const hex = close === -1 ? '' : code.slice(index + 3, close)

    if (/^[\dA-Fa-f]{1,6}$/.test(hex)) {
      const codePoint = Number.parseInt(hex, 16)
      if (codePoint <= 0x10ffff) {
        return { value: String.fromCodePoint(codePoint), end: close + 1 }
      }
    }
  }

  if (char === 'u') {
    const hex = code.slice(index + 2, index + 6)
    if (/^[\dA-Fa-f]{4}$/.test(hex)) {
      return { value: String.fromCharCode(Number.parseInt(hex, 16)), end: index + 6 }
    }
  }

  return { value: char, end: index + 2 }
}

export function readQuotedString(code, index) {
  const quote = code[index]
  if (quote !== "'" && quote !== '"') return null

  let value = ''
  let i = index + 1

  while (i < code.length) {
    const char = code[i]

    if (char === '\\') {
      const escape = decodeEscape(code, i)
      if (!escape) return null
      value += escape.value
      i = escape.end
      continue
    }

    if (char === quote) {
      return { value, end: i + 1 }
    }

    if (char === '\n' || char === '\r') return null

    value += char
    i += 1
  }

  return null
}

function skipTrivia(code, index) {
  let i = index

  while (i < code.length) {
    if (/\s/.test(code[i])) {
      i += 1
      continue
    }

    if (code.startsWith('//', i)) {
      const end = code.indexOf('\n', i + 2)
      return end === -1 ? code.length : skipTrivia(code, end + 1)
    }

    if (code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? code.length : end + 2
      continue
    }

    break
  }

  return i
}

function readFirstStringArg(code, parenIndex) {
  const argStart = skipTrivia(code, parenIndex + 1)
  const literal = readQuotedString(code, argStart)

  if (!literal) return null

  const nextIndex = skipTrivia(code, literal.end)
  const nextChar = code[nextIndex]

  if (nextChar !== ',' && nextChar !== ')') return null

  return literal
}

function createLineLocator(code) {
  const lineStarts = [0]

  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') lineStarts.push(i + 1)
  }

  return (index) => {
    let low = 0
    let high = lineStarts.length

    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (lineStarts[middle] <= index) low = middle + 1
      else high = middle
    }

    return low
  }
}

function addSkipped(context, index, callName, reason) {
  const line = context.lineAt(context.baseOffset + index)
  const id = `${context.file}:${line}:${callName}:${reason}`

  if (context.skippedIds.has(id)) return
  context.skippedIds.add(id)
  context.skipped.push({ file: context.file, line, callName, reason })
}

function tryCollectCall(code, index, context) {
  if (!isIdentifierStart(code[index])) return null

  let end = index + 1
  while (end < code.length && isIdentifierPart(code[end])) end += 1

  const callName = code.slice(index, end)
  if (!context.functionNames.has(callName)) return null

  const previous = code[index - 1] ?? ''
  if (previous === '.' || isIdentifierPart(previous)) return null

  const parenIndex = skipTrivia(code, end)
  if (code[parenIndex] !== '(') return null

  const literal = readFirstStringArg(code, parenIndex)

  if (!literal) {
    addSkipped(context, index, callName, 'first argument is not a static string')
  } else if (literal.value.length === 0) {
    addSkipped(context, index, callName, 'key is empty')
  } else {
    context.keys.add(literal.value)
  }

  return parenIndex + 1
}

function scanTemplateLiteral(code, index, context) {
  let i = index + 1

  while (i < code.length) {
    if (code[i] === '\\') {
      i += 2
      continue
    }

    if (code[i] === '`') return i + 1

    if (code[i] === '$' && code[i + 1] === '{') {
      i = scanJsSegment(code, i + 2, context, 1)
      continue
    }

    i += 1
  }

  return code.length
}

function previousToken(code, index) {
  let end = index - 1
  while (end >= 0 && /\s/.test(code[end])) end -= 1
  if (end < 0) return ''

  if (isIdentifierPart(code[end])) {
    let start = end
    while (start > 0 && isIdentifierPart(code[start - 1])) start -= 1
    return code.slice(start, end + 1)
  }

  return code[end]
}

function isRegexStart(code, index) {
  const previous = previousToken(code, index)
  if (!previous) return true
  if (/^[([{,:;=!?&|+\-*%^~<>]$/.test(previous)) return true

  return regexPrefixKeywords.has(previous)
}

function skipRegexLiteral(code, index) {
  let i = index + 1
  let inCharacterClass = false

  while (i < code.length) {
    if (code[i] === '\\') {
      i += 2
      continue
    }

    if (code[i] === '[') inCharacterClass = true
    else if (code[i] === ']') inCharacterClass = false
    else if (code[i] === '/' && !inCharacterClass) {
      i += 1
      while (i < code.length && /[A-Za-z]/.test(code[i])) i += 1
      return i
    } else if (code[i] === '\n' || code[i] === '\r') {
      return index + 1
    }

    i += 1
  }

  return index + 1
}

function scanJsSegment(code, start, context, initialBraceDepth = 0) {
  let braceDepth = initialBraceDepth
  let i = start

  while (i < code.length) {
    if (code.startsWith('//', i)) {
      const end = code.indexOf('\n', i + 2)
      i = end === -1 ? code.length : end + 1
      continue
    }

    if (code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2)
      i = end === -1 ? code.length : end + 2
      continue
    }

    if (code[i] === '/' && isRegexStart(code, i)) {
      i = skipRegexLiteral(code, i)
      continue
    }

    const char = code[i]

    if (char === "'" || char === '"') {
      const literal = readQuotedString(code, i)
      i = literal ? literal.end : i + 1
      continue
    }

    if (char === '`') {
      i = scanTemplateLiteral(code, i, context)
      continue
    }

    if (braceDepth > 0 && char === '{') {
      braceDepth += 1
      i += 1
      continue
    }

    if (braceDepth > 0 && char === '}') {
      braceDepth -= 1
      i += 1
      if (braceDepth === 0) return i
      continue
    }

    const nextIndex = tryCollectCall(code, i, context)
    if (nextIndex !== null) {
      i = nextIndex
      continue
    }

    i += 1
  }

  return i
}

function scanJsFragment(code, context, baseOffset = 0) {
  scanJsSegment(code, 0, { ...context, baseOffset }, 0)
}

function maskHtmlComments(code) {
  return code.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, ' '))
}

function collectTagBlocks(code, tagName) {
  const blocks = []
  const expression = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'gi')

  for (const match of code.matchAll(expression)) {
    const openEnd = match.index + match[0].indexOf('>') + 1
    blocks.push({
      contentStart: openEnd,
      contentEnd: openEnd + match[1].length,
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return blocks
}

function isInsideRanges(index, ranges) {
  return ranges.find((range) => index >= range.start && index < range.end)
}

function scanVue(code, maskedCode, context, coveredRanges) {
  const interpolation = /\{\{([\s\S]*?)\}\}/dg

  for (const match of maskedCode.matchAll(interpolation)) {
    const [start, end] = match.indices[1]
    scanJsFragment(code.slice(start, end), context, start)
  }

  const directive = /(?:^|[\s<])(?::|@|#|v-)[\w:[\].-]+\s*=\s*(["'])([\s\S]*?)\1/dg

  for (const match of maskedCode.matchAll(directive)) {
    const [start, end] = match.indices[2]
    if (isInsideRanges(start, coveredRanges)) continue
    scanJsFragment(code.slice(start, end), context, start)
  }
}

function collectAstroFrontmatter(code) {
  const match = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/d.exec(code)
  if (!match) return null

  const [contentStart, contentEnd] = match.indices[1]
  return { contentStart, contentEnd, start: match.index, end: match.index + match[0].length }
}

function scanBraceExpressions(code, maskedCode, context, coveredRanges) {
  let i = 0

  while (i < maskedCode.length) {
    const covered = isInsideRanges(i, coveredRanges)
    if (covered) {
      i = covered.end
      continue
    }

    if (maskedCode[i] !== '{') {
      i += 1
      continue
    }

    const fragmentContext = { ...context, baseOffset: 0 }
    const end = scanJsSegment(code, i + 1, fragmentContext, 1)
    i = end > i + 1 ? end : i + 1
  }
}

function scanMarkup(code, ext, context) {
  const maskedCode = maskHtmlComments(code)
  const scriptBlocks = collectTagBlocks(maskedCode, 'script')
  const styleBlocks = collectTagBlocks(maskedCode, 'style')
  const coveredRanges = [...scriptBlocks, ...styleBlocks]

  for (const block of scriptBlocks) {
    scanJsFragment(code.slice(block.contentStart, block.contentEnd), context, block.contentStart)
  }

  if (ext === '.vue') {
    scanVue(code, maskedCode, context, coveredRanges)
    return
  }

  if (ext === '.astro') {
    const frontmatter = collectAstroFrontmatter(code)
    if (frontmatter) {
      coveredRanges.push(frontmatter)
      scanJsFragment(
        code.slice(frontmatter.contentStart, frontmatter.contentEnd),
        context,
        frontmatter.contentStart,
      )
    }
  }

  scanBraceExpressions(code, maskedCode, context, coveredRanges)
}

export function scanCode({ code, ext, file = '<inline>', functionNames = ['tr'] }) {
  const keys = new Set()
  const skipped = []
  const context = {
    file,
    baseOffset: 0,
    functionNames: new Set(functionNames),
    keys,
    skipped,
    skippedIds: new Set(),
    lineAt: createLineLocator(code),
  }

  if (markupExts.has(ext)) scanMarkup(code, ext, context)
  else scanJsFragment(code, context)

  return { keys, skipped }
}

function walkFiles(dir, callback) {
  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const item of items) {
    const fullPath = path.join(dir, item.name)

    if (item.isDirectory()) {
      if (!skipDirs.has(item.name)) walkFiles(fullPath, callback)
      continue
    }

    if (item.isFile()) callback(fullPath)
  }
}

function isPathInside(file, directory) {
  const relative = path.relative(directory, file)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function scanSource({ sourceDir, localesDir, functionNames = ['tr'] }) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`)
  }

  const keys = new Set()
  const skipped = []

  walkFiles(sourceDir, (file) => {
    if (isPathInside(file, localesDir)) return

    const ext = path.extname(file).toLowerCase()
    if (!codeExts.has(ext)) return

    const result = scanCode({
      code: fs.readFileSync(file, 'utf8'),
      ext,
      file,
      functionNames,
    })

    for (const key of result.keys) keys.add(key)
    skipped.push(...result.skipped)
  })

  return { keys, skipped }
}
