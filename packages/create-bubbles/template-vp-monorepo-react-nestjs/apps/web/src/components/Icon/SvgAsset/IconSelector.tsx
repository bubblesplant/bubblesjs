import { Select, Space } from 'antd'
import type { SelectProps } from 'antd'
import SvgAssetIcon from './SvgAssetIcon'
import { svgAssets } from './SvgAssetRegistry'

export type IconSelectorProps = Omit<
  SelectProps<string>,
  'labelRender' | 'optionRender' | 'options'
>

const options = svgAssets.map((asset) => ({ value: asset.key, label: asset.key }))

/** 提供本地 SVG 图标的搜索、预览、选择、清空和编辑回显。 */
export default function IconSelector({
  placeholder = '搜索并选择图标',
  ...props
}: IconSelectorProps) {
  /** 渲染带预览图标的候选项或当前已选值。 */
  const renderValue = (value: unknown, label?: ReactNode) => (
    <Space size={8}>
      <SvgAssetIcon name={String(value)} size="1.1em" />
      <span>{label ?? String(value)}</span>
    </Space>
  )

  return (
    <Select<string>
      {...props}
      allowClear
      showSearch
      optionFilterProp="label"
      options={options}
      placeholder={placeholder}
      optionRender={(option) => renderValue(option.value, option.label)}
      labelRender={({ value, label }) => renderValue(value, label)}
    />
  )
}
