import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  MemberRecord,
  OrganizationMemberCandidate,
  OrganizationScope,
  PositionRecord,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import { canAddPositionAssignment } from '@/utils/organization-assignment'
import { PositionSelector, type PositionSelectorRef } from '@/components/Selector'

export interface MemberPositionsDialogRef {
  show: (
    member: MemberRecord,
    candidate: OrganizationMemberCandidate,
    positions: PositionRecord[],
  ) => void
  hide: () => void
}

/** 只读取当前 URL 作用域的岗位，避免聚合候选串入其他项目。 */
function currentPositionIds(candidate: OrganizationMemberCandidate, scope: OrganizationScope) {
  const scopeKey = accessScopeKey(scope)
  return [
    ...new Set(
      candidate.identities
        .filter((identity) => accessScopeKey(identity.scope) === scopeKey)
        .flatMap((identity) => identity.positions.map((item) => item.id)),
    ),
  ]
}

/** 为公共岗位选择器注入成员资格和保存动作，保留既有成员编辑协议。 */
export default function MemberPositionsDialog({
  ref,
  scope,
  onSave,
}: {
  ref: Ref<MemberPositionsDialogRef>
  scope: OrganizationScope
  onSave: (member: MemberRecord, positionIds: string[]) => Promise<boolean>
}) {
  const selectorRef = useRef<PositionSelectorRef>(null)
  const memberRef = useRef<MemberRecord | undefined>(undefined)
  const savingRef = useRef(false)
  const { tr } = useI18n()
  useImperativeHandle(ref, () => ({
    /** 打开当前成员岗位编辑，并注入当前作用域资格约束。 */
    show: (member, candidate, positions) => {
      if (savingRef.current) return
      memberRef.current = member
      selectorRef.current?.show({
        positions,
        value: currentPositionIds(candidate, scope),
        title: tr('编辑岗位任职 · {name}', { name: member.name }),
        description: (
          <Alert
            type="info"
            showIcon
            title={tr('一名成员可以任多个岗位')}
            description={tr('保存只替换岗位任职，不会修改组织归属或角色。')}
          />
        ),
        isPositionDisabled: (position) =>
          !canAddPositionAssignment({
            candidate,
            scope,
            positionActive: position.status === 'active',
          }),
      })
    },
    hide: () => selectorRef.current?.hide(),
  }))
  return (
    <PositionSelector
      ref={selectorRef}
      onConfirm={
        /** 将完整岗位集合提交给当前成员，提交期间不允许替换保存目标。 */
        async (ids) => {
          const member = memberRef.current
          if (!member || savingRef.current) return false
          savingRef.current = true
          try {
            return await onSave(member, ids)
          } finally {
            savingRef.current = false
          }
        }
      }
    />
  )
}
