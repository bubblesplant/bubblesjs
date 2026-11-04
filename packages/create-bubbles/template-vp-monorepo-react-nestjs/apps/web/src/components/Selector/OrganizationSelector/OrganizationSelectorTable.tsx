import { Select, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationDuty, OrganizationUnitNode } from 'shared/types'
import type { OrganizationSelectorOpenOptions } from './OrganizationSelectorTypes'
import styles from '../components/AffiliationPicker/AffiliationPicker.module.css'

/** 两种模式共享组织表格，只在启用职责时创建职责列与下拉框。 */
export default function OrganizationSelectorTable({
  units,
  multiple,
  selectedIds,
  duties,
  saving,
  enableDuties,
  isOrganizationDisabled,
  isDutyDisabled,
  onChange,
  onDutyChange,
}: Pick<OrganizationSelectorOpenOptions, 'isOrganizationDisabled' | 'isDutyDisabled'> & {
  units: OrganizationUnitNode[]
  multiple: boolean
  selectedIds: string[]
  duties: Record<string, OrganizationDuty>
  saving: boolean
  enableDuties: boolean
  onChange: (ids: string[]) => void
  onDutyChange: (unitId: string, duty: OrganizationDuty) => void
}) {
  const { tr } = useI18n()
  const columns: TableColumnsType<OrganizationUnitNode> = [
    {
      title: tr('组织单元'),
      dataIndex: 'fullPath',
      render: (path: string) => <span className={styles.path}>{path}</span>,
    },
  ]
  if (enableDuties) {
    columns.push({
      title: tr('职责'),
      width: 132,
      render: (_, unit) => (
        <Select<OrganizationDuty>
          value={duties[unit.id] ?? 'member'}
          style={{ width: '100%' }}
          aria-label={tr('组织职责 {name}', { name: unit.fullPath })}
          disabled={saving || !selectedIds.includes(unit.id)}
          options={[
            { value: 'member', label: tr('成员') },
            { value: 'deputy', label: tr('副负责人') },
            { value: 'leader', label: tr('负责人') },
          ].map((option) => ({
            ...option,
            disabled: isDutyDisabled?.({ unit, duty: option.value as OrganizationDuty }),
          }))}
          onChange={(duty) => onDutyChange(unit.id, duty)}
        />
      ),
    })
  }
  return (
    <Table<OrganizationUnitNode>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={units}
      scroll={{ y: 330 }}
      rowSelection={{
        type: multiple ? 'checkbox' : 'radio',
        selectedRowKeys: selectedIds,
        preserveSelectedRowKeys: true,
        getCheckboxProps: (unit) => ({
          disabled: saving || (!selectedIds.includes(unit.id) && isOrganizationDisabled?.(unit)),
        }),
        onChange: (keys) => onChange(keys.map(String)),
      }}
      columns={columns}
    />
  )
}
