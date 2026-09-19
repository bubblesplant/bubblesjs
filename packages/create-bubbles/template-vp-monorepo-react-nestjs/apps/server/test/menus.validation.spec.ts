import { describe, expect, it } from 'vite-plus/test'
import { createMenuSchema } from '@/modules/menus/menus.validation'

const baseMenu = {
  expectedVersion: 1,
  type: 'directory' as const,
  parentId: null,
  name: '自定义目录',
}

describe('菜单图标 key 校验', () => {
  it('允许空值、稳定 SVG key 和子目录 key', () => {
    for (const icon of ['', 'organization-template', 'admin/overview']) {
      expect(createMenuSchema.parse({ ...baseMenu, icon }).icon).toBe(icon)
    }
  })

  it('拒绝 URL、路径穿越、HTML 和旧 Ant Design 图标名', () => {
    for (const icon of [
      'https://example.invalid/icon.svg',
      '../menu-item',
      '<svg>',
      'MenuOutlined',
    ]) {
      expect(() => createMenuSchema.parse({ ...baseMenu, icon })).toThrow()
    }
  })
})
