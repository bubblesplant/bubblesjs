import { describe, expect, it } from 'vitest'
import { Entities, Entity } from '../src/utils/Label/Entity'
import { RelationList, RelationListItem } from '../src/utils/Label/Relation'

describe('relationListItem', () => {
  const fromEntity = new Entity(1, 1, 0, 5)
  const toEntity = new Entity(2, 1, 10, 15)
  const relation = new RelationListItem(1, 1, fromEntity, toEntity)

  describe('offsets', () => {
    it('should return correct startOffset', () => {
      expect(relation.startOffset).toBe(0)
    })

    it('should return correct endOffset', () => {
      expect(relation.endOffset).toBe(15)
    })
  })

  describe('width', () => {
    it('should return width between entity centers', () => {
      // fromEntity center: 2.5, toEntity center: 12.5
      expect(relation.width).toBe(10)
    })
  })

  describe('isIn', () => {
    it('should return true when relation overlaps range', () => {
      expect(relation.isIn(0, 20)).toBe(true)
      expect(relation.isIn(3, 8)).toBe(true)
    })

    it('should return false when no overlap', () => {
      expect(relation.isIn(20, 30)).toBe(false)
    })
  })

  describe('consistOf', () => {
    it('should return true for fromEntity', () => {
      expect(relation.consistOf(fromEntity)).toBe(true)
    })

    it('should return true for toEntity', () => {
      expect(relation.consistOf(toEntity)).toBe(true)
    })

    it('should return false for other entity', () => {
      const other = new Entity(3, 1, 20, 25)
      expect(relation.consistOf(other)).toBe(false)
    })
  })

  describe('isOpenOnLeft', () => {
    it('should return true when relation starts before offset', () => {
      expect(relation.isOpenOnLeft(5)).toBe(true)
    })

    it('should return false when relation starts at or after offset', () => {
      expect(relation.isOpenOnLeft(0)).toBe(false)
    })
  })

  describe('isOpenOnRight', () => {
    it('should return true when later entity starts at or after offset', () => {
      expect(relation.isOpenOnRight(10)).toBe(true)
    })

    it('should return false when later entity starts before offset', () => {
      expect(relation.isOpenOnRight(15)).toBe(false)
    })
  })

  describe('isVisible', () => {
    it('should return true when offset <= max entity start', () => {
      expect(relation.isVisible(10)).toBe(true)
      expect(relation.isVisible(5)).toBe(true)
    })

    it('should return false when offset > max entity start', () => {
      expect(relation.isVisible(11)).toBe(false)
    })
  })
})

describe('relationList', () => {
  const entities = new Entities([
    new Entity(1, 1, 0, 5),
    new Entity(2, 1, 10, 15),
    new Entity(3, 1, 20, 25),
  ])

  const relations = [
    { id: 1, labelId: 1, fromId: 1, toId: 2 },
    { id: 2, labelId: 2, fromId: 2, toId: 3 },
  ]

  const relationList = new RelationList(relations, entities)

  describe('filterByRange', () => {
    it('should filter relations within range', () => {
      const result = relationList.filterByRange(0, 20)
      expect(result.length).toBe(2)
    })

    it('should return only matching relations', () => {
      const result = relationList.filterByRange(0, 10)
      expect(result.length).toBe(1)
      expect(result[0].id).toBe(1)
    })

    it('should return empty when no match', () => {
      const result = relationList.filterByRange(30, 40)
      expect(result.length).toBe(0)
    })
  })
})
