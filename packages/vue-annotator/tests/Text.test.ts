import { describe, expect, it } from 'vitest'
import { Text } from '../src/utils/Label/Text'

describe('text', () => {
  describe('basic text', () => {
    const text = new Text('hello world')

    it('should return correct codePointLength', () => {
      expect(text.codePointLength).toBe(11)
    })

    it('should return correct graphemeLength', () => {
      expect(text.graphemeLength).toBe(11)
    })

    it('should return correct charAt', () => {
      expect(text.charAt(0)).toBe('h')
      expect(text.charAt(6)).toBe('w')
    })

    it('should return correct graphemeAt', () => {
      expect(text.graphemeAt(0)).toBe('h')
      expect(text.graphemeAt(6)).toBe('w')
    })

    it('should return empty string for out of range', () => {
      expect(text.graphemeAt(-1)).toBe('')
      expect(text.graphemeAt(100)).toBe('')
    })

    it('should return correct substr', () => {
      expect(text.substr(0, 5)).toBe('hello')
      expect(text.substr(6, 5)).toBe('world')
    })
  })

  describe('chinese text', () => {
    const text = new Text('你好世界')

    it('should return correct codePointLength', () => {
      expect(text.codePointLength).toBe(4)
    })

    it('should return correct graphemeLength', () => {
      expect(text.graphemeLength).toBe(4)
    })

    it('should return correct graphemeAt', () => {
      expect(text.graphemeAt(0)).toBe('你')
      expect(text.graphemeAt(1)).toBe('好')
    })
  })

  describe('emoji text', () => {
    const text = new Text('👨‍👩‍👧‍👦hello')

    it('should handle emoji as single grapheme', () => {
      expect(text.graphemeAt(0)).toBe('👨‍👩‍👧‍👦')
      expect(text.graphemeAt(1)).toBe('h')
    })

    it('should have different grapheme and codePoint length', () => {
      expect(text.graphemeLength).toBe(6) // 1 emoji + 5 chars
      expect(text.codePointLength).toBeGreaterThan(6)
    })
  })

  describe('offset conversion', () => {
    const text = new Text('👨‍👩‍👧‍👦ab')

    it('should convert grapheme to codePoint offset', () => {
      expect(text.toCodePointOffset(0)).toBe(0)
      expect(text.toCodePointOffset(1)).toBe(11) // after emoji
    })

    it('should convert codePoint to grapheme offset', () => {
      expect(text.toGraphemeOffset(0)).toBe(0)
      expect(text.toGraphemeOffset(11)).toBe(1)
    })
  })

  describe('getWord', () => {
    const text = new Text('hello world test')

    it('should return word at index', () => {
      expect(text.getWord(0)).toBe('hello')
      expect(text.getWord(6)).toBe('world')
      expect(text.getWord(12)).toBe('test')
    })

    it('should return undefined for non-word index', () => {
      expect(text.getWord(5)).toBeUndefined() // space
      expect(text.getWord(3)).toBeUndefined() // middle of word
    })
  })
})
