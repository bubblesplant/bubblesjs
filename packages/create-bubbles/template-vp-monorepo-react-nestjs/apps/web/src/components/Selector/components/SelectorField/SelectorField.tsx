import { Select } from 'antd'
import type { SelectProps } from 'antd'

type ManagedProps =
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'options'
  | 'mode'
  | 'open'
  | 'onOpenChange'
  | 'labelInValue'
  | 'showSearch'
  | 'filterOption'
  | 'onSearch'
  | 'labelRender'
  | 'tagRender'
  | 'children'
  | 'fieldNames'

/** 弹窗字段可透传的标准 Select 属性，表单值由外层 Form 托管。 */
export type SelectorFieldStyleProps = Omit<SelectProps<string | string[]>, ManagedProps>

export interface SelectorFieldProps extends SelectorFieldStyleProps {
  multiple?: boolean
  value?: readonly string[]
  options: { value: string; label: ReactNode }[]
  onChange?: (ids: string[]) => void
  onOpen: () => void
}

/** 按模式展示单行入口，单选／多选的删除和清空均回传数组。 */
export default function SelectorField({
  value = [],
  multiple = true,
  options,
  onChange,
  onOpen,
  disabled,
  allowClear = true,
  maxTagCount = 'responsive',
  style,
  ...props
}: SelectorFieldProps) {
  return (
    <Select<string | string[]>
      {...props}
      style={{ width: '100%', ...style }}
      value={multiple ? [...value] : value[0]}
      options={options}
      mode={multiple ? 'multiple' : undefined}
      open={false}
      showSearch={false}
      disabled={disabled}
      allowClear={allowClear}
      maxTagCount={maxTagCount}
      onOpenChange={(open) => {
        if (open && !disabled) onOpen()
      }}
      onChange={(ids) => {
        const next = [...new Set(Array.isArray(ids) ? ids : ids ? [ids] : [])]
        if (!disabled) onChange?.(multiple ? next : next.slice(0, 1))
      }}
    />
  )
}
