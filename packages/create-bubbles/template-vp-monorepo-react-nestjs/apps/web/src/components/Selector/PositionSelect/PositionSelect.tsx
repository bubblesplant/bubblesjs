import { useI18n } from '@bubblesjs/i18n-react'
import type { PositionRecord } from 'shared/types'
import PositionSelector, {
  type PositionSelectorOpenOptions,
  type PositionSelectorRef,
} from '../PositionSelector'
import SelectorField, { type SelectorFieldStyleProps } from '../components/SelectorField'

export interface PositionSelectProps
  extends SelectorFieldStyleProps, Omit<PositionSelectorOpenOptions, 'value'> {
  value?: string[]
  /** 返回稳定 ID 与同序完整岗位记录，单选和清空仍为数组。 */
  onChange?: (ids: string[], records: PositionRecord[]) => void
}

/** 受控岗位字段，兼容 Form 初始值、程序赋值、校验和重置。 */
export default function PositionSelect({
  value = [],
  multiple = true,
  positions,
  title,
  description,
  isPositionDisabled,
  onChange,
  ...fieldProps
}: PositionSelectProps) {
  const { tr } = useI18n()
  const selectorRef = useRef<PositionSelectorRef>(null)
  const uniqueIds = [...new Set(value)]
  const ids = multiple ? uniqueIds : uniqueIds.slice(0, 1)
  const positionById = new Map(positions.map((position) => [position.id, position]))

  /** 标签移除或清空时，从当前候选取得其余记录并保留无法解析的 ID。 */
  const change = (next: string[]) => {
    if (!fieldProps.disabled)
      onChange?.(
        next,
        next
          .map((id) => positionById.get(id))
          .filter((position): position is PositionRecord => !!position),
      )
  }

  return (
    <>
      <SelectorField
        {...fieldProps}
        multiple={multiple}
        value={ids}
        placeholder={fieldProps.placeholder ?? tr('选择岗位')}
        options={ids.map((id) => {
          const position = positionById.get(id)
          return {
            value: id,
            label: position
              ? `${position.name} · ${position.code}`
              : `${id} · ${tr('记录信息不可用')}`,
          }
        })}
        onChange={change}
        onOpen={() =>
          selectorRef.current?.show({
            positions,
            multiple,
            value: ids,
            title,
            description,
            isPositionDisabled,
          })
        }
      />
      <PositionSelector
        ref={selectorRef}
        onConfirm={(next, records) => {
          if (!fieldProps.disabled) onChange?.(next, records)
        }}
      />
    </>
  )
}
