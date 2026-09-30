import { describe, expect, it, vi } from 'vite-plus/test'
import { IconSelector } from '../src/components/Icon/SvgAsset'
import { svgAssets } from '../src/components/Icon/SvgAsset/SvgAssetRegistry'

describe('菜单图标选择器', () => {
  it('展示 SVG 目录中的全部资源并支持搜索、清空和回显', () => {
    const onChange = vi.fn()
    const element = IconSelector({ value: 'organization-template', onChange })
    const props = element.props

    expect(props.allowClear).toBe(true)
    expect(props.showSearch).toBe(true)
    expect(props.optionFilterProp).toBe('label')
    expect(props.options.map((option: { value: string }) => option.value)).toEqual(
      svgAssets.map((asset) => asset.key),
    )
    expect(
      props.labelRender({ value: 'organization-template', label: 'organization-template' }),
    ).toBeTruthy()
    props.onChange?.('', { value: '' })
    expect(onChange).toHaveBeenCalledWith('', { value: '' })
  })
})
