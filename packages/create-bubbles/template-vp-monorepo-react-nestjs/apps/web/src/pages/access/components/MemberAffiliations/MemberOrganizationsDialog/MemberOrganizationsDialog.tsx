import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  MemberRecord,
  OrganizationMemberCandidate,
  OrganizationRelationInput,
  OrganizationScope,
  OrganizationUnitNode,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import { OrganizationSelector } from '@/components/Selector'
import type { OrganizationSelectorRef } from '@/components/Selector'
import {
  canAddOrganizationAssignment,
  canChangeOrganizationDuty,
} from '@/utils/organization-assignment'

export interface MemberOrganizationsDialogRef {
  show: (
    member: MemberRecord,
    candidate: OrganizationMemberCandidate,
    units: OrganizationUnitNode[],
  ) => void
  hide: () => void
}

/** 只读取成员当前 URL 作用域的组织关系，避免带入其他项目身份。 */
function currentRelations(candidate: OrganizationMemberCandidate, scope: OrganizationScope) {
  const scopeKey = accessScopeKey(scope)
  return candidate.identities
    .filter((identity) => accessScopeKey(identity.scope) === scopeKey)
    .flatMap((identity) => identity.organizationUnits)
}

/** 适配成员归属业务，显式开启职责并保留现有保存协议和禁选规则。 */
export default function MemberOrganizationsDialog({
  ref,
  scope,
  onSave,
}: {
  ref: Ref<MemberOrganizationsDialogRef>
  scope: OrganizationScope
  onSave: (member: MemberRecord, relations: OrganizationRelationInput[]) => Promise<boolean>
}) {
  const selectorRef = useRef<OrganizationSelectorRef>(null)
  const memberRef = useRef<MemberRecord | undefined>(undefined)
  const savingRef = useRef(false)
  const { tr } = useI18n()

  useImperativeHandle(ref, () => ({
    /** 将当前成员关系和规则注入通用选择器；提交期间禁止切换成员。 */
    show: (member, candidate, units) => {
      if (savingRef.current) return
      const relations = currentRelations(candidate, scope)
      const initialDuties = new Map(relations.map((relation) => [relation.id, relation.duty]))
      memberRef.current = member
      selectorRef.current?.show({
        units,
        relations: relations.map(({ id, duty }) => ({ organizationUnitId: id, duty })),
        title: tr('编辑组织归属 · {name}', { name: member.name }),
        description: (
          <Alert
            type="info"
            showIcon
            title={tr('所有组织归属同等有效')}
            description={tr('成员可以加入多个组织单元，不存在主归属；保存不会改变岗位或角色。')}
          />
        ),
        isOrganizationDisabled: (unit) =>
          !canAddOrganizationAssignment({ candidate, scope, unitEffective: unit.effective }),
        isDutyDisabled: ({ unit, duty }) =>
          !canChangeOrganizationDuty({
            candidate,
            scope,
            unitEffective: unit.effective,
            initialDuty: initialDuties.get(unit.id),
            nextDuty: duty,
          }),
      })
    },
    hide: () => selectorRef.current?.hide(),
  }))

  return (
    <OrganizationSelector
      ref={selectorRef}
      enableDuties
      onConfirm={
        /** 只替换组织关系，不触碰独立岗位或角色。 */ async (relations) => {
          if (!memberRef.current || savingRef.current) return false
          savingRef.current = true
          try {
            return await onSave(memberRef.current, relations)
          } finally {
            savingRef.current = false
          }
        }
      }
    />
  )
}
