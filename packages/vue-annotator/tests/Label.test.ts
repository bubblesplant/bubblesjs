import { describe, expect, it } from 'vite-plus/test'
import { EntityLabelListItem, LabelList, LabelListItem } from '../src/utils/Label/Label'

describe('labelListItem', () => {
  describe('basic properties', () => {
    const item = new LabelListItem(1, 'Person', '#ff0000', 50, 12)

    it('should have correct properties', () => {
      expect(item.id).toBe(1)
      expect(item.text).toBe('Person')
      expect(item.color).toBe('#ff0000')
      expect(item.textWidth).toBe(50)
    })

    it('should return textWidth as width', () => {
      expect(item.width).toBe(50)
    })
  })

  describe('truncatedText', () => {
    it('should not truncate short text', () => {
      const item = new LabelListItem(1, 'Short', '#000', 30, 12)
      expect(item.truncatedText).toBe('Short')
    })

    it('should truncate long text', () => {
      const item = new LabelListItem(1, 'VeryLongLabelText', '#000', 100, 10)
      expect(item.truncatedText).toBe('VeryLongLa...')
    })
  })

  describe('truncatedWidth', () => {
    it('should calculate truncated width', () => {
      const item = new LabelListItem(1, 'Test', '#000', 40, 12)
      // meanCharLength = 40 / 4 = 10
      // truncatedWidth = 10 * min(4, 12) = 40
      expect(item.truncatedWidth).toBe(40)
    })

    it('should calculate truncated width for long text', () => {
      const item = new LabelListItem(1, 'VeryLongText', '#000', 120, 6)
      // meanCharLength = 120 / 12 = 10
      // truncatedWidth = 10 * min(12, 6) = 60
      expect(item.truncatedWidth).toBe(60)
    })
  })
})

describe('entityLabelListItem', () => {
  it('should include diameter and margin in width', () => {
    const item = new EntityLabelListItem(1, 'Test', '#000', 50, 12)
    // width = diameter + labelMargin + textWidth
    // default: 8 + 4 + 50 = 62
    expect(item.width).toBeGreaterThan(50)
  })
})

describe('labelList', () => {
  const labels = [
    new LabelListItem(1, 'Person', '#ff0000', 50, 12),
    new LabelListItem(2, 'Location', '#00ff00', 60, 12),
    new LabelListItem(3, 'Organization', '#0000ff', 80, 12),
  ]
  const labelList = new LabelList(labels)

  describe('getById', () => {
    it('should return label by id', () => {
      const label = labelList.getById(2)
      expect(label?.text).toBe('Location')
    })

    it('should return undefined for non-existent id', () => {
      expect(labelList.getById(999)).toBeUndefined()
    })
  })

  describe('getColor', () => {
    it('should return color by id', () => {
      expect(labelList.getColor(1)).toBe('#ff0000')
    })
  })

  describe('getText', () => {
    it('should return truncated text by id', () => {
      expect(labelList.getText(1)).toBe('Person')
    })
  })

  describe('getWidth', () => {
    it('should return truncated width by id', () => {
      expect(labelList.getWidth(1)).toBe(50)
    })
  })

  describe('maxLabelWidth', () => {
    it('should return max truncated width', () => {
      expect(labelList.maxLabelWidth).toBe(80)
    })
  })

  describe('valueOf', () => {
    it('should create LabelList from labels', () => {
      const rawLabels = [
        { id: 1, text: 'Test', color: '#000' },
        { id: 2, text: 'Demo', backgroundColor: '#fff' },
      ]
      const widths = [30, 40]
      const list = LabelList.valueOf(12, rawLabels, widths, LabelListItem)

      expect(list.getById(1)?.text).toBe('Test')
      expect(list.getById(2)?.color).toBe('#fff')
    })
  })
})
