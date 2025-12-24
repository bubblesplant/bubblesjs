import { describe, expect, it } from 'vitest'
import { Entities, Entity } from '../src/utils/Label/Entity'

describe('entity', () => {
  describe('constructor', () => {
    it('should create entity with valid offsets', () => {
      const entity = new Entity(1, 1, 0, 5)
      expect(entity.id).toBe(1)
      expect(entity.label).toBe(1)
      expect(entity.startOffset).toBe(0)
      expect(entity.endOffset).toBe(5)
    })

    it('should throw error when startOffset > endOffset', () => {
      expect(() => new Entity(1, 1, 10, 5)).toThrow(RangeError)
    })

    it('should allow equal start and end offset', () => {
      const entity = new Entity(1, 1, 5, 5)
      expect(entity.startOffset).toBe(5)
      expect(entity.endOffset).toBe(5)
    })
  })

  describe('isIn', () => {
    const entity = new Entity(1, 1, 5, 10)

    it('should return true when entity starts within range', () => {
      expect(entity.isIn(0, 6)).toBe(true)
    })

    it('should return true when entity ends within range', () => {
      expect(entity.isIn(8, 15)).toBe(true)
    })

    it('should return true when range is inside entity', () => {
      expect(entity.isIn(6, 8)).toBe(true)
    })

    it('should return false when no overlap', () => {
      expect(entity.isIn(0, 3)).toBe(false)
      expect(entity.isIn(15, 20)).toBe(false)
    })
  })

  describe('equalTo', () => {
    it('should return true for same id', () => {
      const e1 = new Entity(1, 1, 0, 5)
      const e2 = new Entity(1, 2, 10, 15)
      expect(e1.equalTo(e2)).toBe(true)
    })

    it('should return false for different id', () => {
      const e1 = new Entity(1, 1, 0, 5)
      const e2 = new Entity(2, 1, 0, 5)
      expect(e1.equalTo(e2)).toBe(false)
    })
  })

  describe('startsAfter', () => {
    const entity = new Entity(1, 1, 5, 10)

    it('should return true when offset <= startOffset', () => {
      expect(entity.startsAfter(5)).toBe(true)
      expect(entity.startsAfter(3)).toBe(true)
    })

    it('should return false when offset > startOffset', () => {
      expect(entity.startsAfter(6)).toBe(false)
    })
  })

  describe('center', () => {
    it('should return center offset', () => {
      const entity = new Entity(1, 1, 0, 10)
      expect(entity.center).toBe(5)
    })

    it('should handle odd length', () => {
      const entity = new Entity(1, 1, 0, 5)
      expect(entity.center).toBe(2.5)
    })
  })
})

describe('entities', () => {
  const entities = new Entities([
    new Entity(1, 1, 0, 5),
    new Entity(2, 2, 10, 15),
    new Entity(3, 1, 20, 25),
  ])

  describe('size', () => {
    it('should return correct size', () => {
      expect(entities.size).toBe(3)
    })
  })

  describe('findById', () => {
    it('should find entity by id', () => {
      const entity = entities.findById(2)
      expect(entity?.id).toBe(2)
      expect(entity?.startOffset).toBe(10)
    })

    it('should return undefined for non-existent id', () => {
      expect(entities.findById(999)).toBeUndefined()
    })
  })

  describe('filterByRange', () => {
    it('should filter entities within range', () => {
      const result = entities.filterByRange(0, 12)
      expect(result.length).toBe(2)
    })

    it('should return empty array when no match', () => {
      const result = entities.filterByRange(30, 40)
      expect(result.length).toBe(0)
    })
  })

  describe('intersectAny', () => {
    it('should return true when intersection exists', () => {
      expect(entities.intersectAny(3, 8)).toBe(true)
    })

    it('should return false when no intersection', () => {
      expect(entities.intersectAny(6, 9)).toBe(false)
    })
  })
})
