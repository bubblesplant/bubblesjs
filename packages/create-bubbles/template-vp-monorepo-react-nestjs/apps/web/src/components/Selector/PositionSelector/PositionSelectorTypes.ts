import type { PositionRecord } from 'shared/types'

export interface PositionSelectorOpenOptions {
  positions: readonly PositionRecord[]
  value?: readonly string[]
  /** 默认多选；单选确认仍返回数组。 */
  multiple?: boolean
  title?: string
  description?: ReactNode
  isPositionDisabled?: (position: PositionRecord) => boolean
}

export interface PositionSelectorRef {
  show: (options: PositionSelectorOpenOptions) => void
  hide: () => void
}

export interface PositionSelectorProps {
  ref: Ref<PositionSelectorRef>
  /** 第二参数按选中 ID 顺序返回完整岗位记录，缺失项不伪造。 */
  onConfirm: (ids: string[], records: PositionRecord[]) => void | boolean | Promise<void | boolean>
}
