import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationDuty, OrganizationUnitNode } from 'shared/types'
import OrganizationSelector, { type OrganizationSelectorRef } from '../OrganizationSelector'
import SelectorField from '../components/SelectorField'
import type { OrganizationSelectProps } from './OrganizationSelectTypes'

/** 在标准表单中选择组织，职责开启时将完整关系作为字段值。 */
export default function OrganizationSelect(props: OrganizationSelectProps) {
  const {
    units,
    multiple = true,
    title,
    description,
    isOrganizationDisabled,
    isDutyDisabled,
    enableDuties,
    value,
    onChange,
    ...fieldProps
  } = props
  const { tr } = useI18n()
  const selectorRef = useRef<OrganizationSelectorRef>(null)
  const relations = enableDuties ? (value ?? []) : []
  const uniqueIds = [
    ...new Set(enableDuties ? relations.map((item) => item.organizationUnitId) : (value ?? [])),
  ]
  const ids = multiple ? uniqueIds : uniqueIds.slice(0, 1)
  const unitById = new Map(units.map((unit) => [unit.id, unit]))
  const dutyById = new Map(relations.map((item) => [item.organizationUnitId, item.duty]))
  const dutyNames: Record<OrganizationDuty, string> = {
    member: tr('成员'),
    deputy: tr('副负责人'),
    leader: tr('负责人'),
  }

  /** 每次打开都读取最新受控值，取消后重新打开不会残留未提交草稿。 */
  const show = () =>
    selectorRef.current?.show({
      units,
      multiple,
      value: ids,
      relations,
      title,
      description,
      isOrganizationDisabled,
      isDutyDisabled,
    })

  /** 清空或移除标签时保留其余组织的职责，并同序输出实际找到的完整组织记录。 */
  const change = (nextIds: string[]) => {
    if (fieldProps.disabled) return
    const records = nextIds
      .map((id) => unitById.get(id))
      .filter((unit): unit is OrganizationUnitNode => !!unit)
    if (enableDuties)
      onChange?.(
        nextIds.map((organizationUnitId) => ({
          organizationUnitId,
          duty: dutyById.get(organizationUnitId) ?? 'member',
        })),
        records,
      )
    else onChange?.(nextIds, records)
  }

  return (
    <>
      <SelectorField
        {...fieldProps}
        multiple={multiple}
        placeholder={fieldProps.placeholder ?? tr('选择组织单元')}
        value={ids}
        options={ids.map((id) => ({
          value: id,
          label: `${unitById.get(id)?.fullPath ?? `${id} · ${tr('记录信息不可用')}`}${enableDuties ? ` · ${dutyNames[dutyById.get(id) ?? 'member']}` : ''}`,
        }))}
        onOpen={show}
        onChange={change}
      />
      {enableDuties ? (
        <OrganizationSelector
          ref={selectorRef}
          enableDuties
          onConfirm={(next, records) => {
            if (!fieldProps.disabled) onChange?.(next, records)
          }}
        />
      ) : (
        <OrganizationSelector
          ref={selectorRef}
          onConfirm={(next, records) => {
            if (!fieldProps.disabled) onChange?.(next, records)
          }}
        />
      )}
    </>
  )
}
