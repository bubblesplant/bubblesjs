import type { ProColumns } from '@ant-design/pro-components'
import { Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { RoleRecord } from 'shared/types'
import BasicTableSelector, { type BasicTableSelectorRef } from '../BasicTableSelector'
import SelectorField, { type SelectorFieldStyleProps } from '../components/SelectorField'

export interface RoleSelectProps extends SelectorFieldStyleProps {
  /** 默认多选；单选确认仍回传最多一项的数组。 */
  multiple?: boolean
  value?: string[]
  roles: readonly RoleRecord[]
  originalRoleIds?: readonly string[]
  isRoleDisabled?: (role: RoleRecord) => boolean
  /** 返回稳定 ID 与按选择顺序排列的完整角色记录；缺失记录不伪造。 */
  onChange?: (roleIds: string[], records: RoleRecord[]) => void
}

/** 在表格弹窗中编辑角色草稿，确认后才回填受控表单字段。 */
export default function RoleSelect({
  value = [],
  multiple = true,
  roles,
  originalRoleIds = [],
  isRoleDisabled,
  onChange,
  ...fieldProps
}: RoleSelectProps) {
  const { tr } = useI18n()
  const selectorRef = useRef<BasicTableSelectorRef<RoleRecord>>(null)
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const uniqueIds = [...new Set(value)]
  const ids = multiple ? uniqueIds : uniqueIds.slice(0, 1)

  /** 确认、移除和清空均同步输出值与可信记录，不因缺失候选删除原 ID。 */
  const change = (nextIds: string[]) => {
    if (fieldProps.disabled) return
    const unique = [...new Set(nextIds)]
    const next = multiple ? unique : unique.slice(0, 1)
    onChange?.(
      next,
      next.map((id) => roleById.get(id)).filter((role): role is RoleRecord => !!role),
    )
  }

  /** 基于打开分配表单时的角色资格判断禁选，允许撤销后恢复原有角色。 */
  const canSelect = (role: RoleRecord) =>
    originalRoleIds.includes(role.id) || !(isRoleDisabled?.(role) ?? !role.assignable)

  /** 对当前作用域已加载的角色按名称搜索和分页，保持选择器请求引用稳定。 */
  const request = useCallback(
    async (params: { query?: string; current?: number; pageSize?: number }) => {
      const query = params.query?.trim().toLocaleLowerCase() ?? ''
      const filtered = roles.filter((role) => role.name.toLocaleLowerCase().includes(query))
      const pageSize = params.pageSize ?? 10
      const start = ((params.current ?? 1) - 1) * pageSize
      return {
        data: filtered.slice(start, start + pageSize),
        total: filtered.length,
        success: true,
      }
    },
    [roles],
  )

  const columns: ProColumns<RoleRecord>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索角色名称') },
    },
    { title: tr('角色名称'), dataIndex: 'name', search: false, width: 180, fixed: 'left' },
    {
      title: tr('类型'),
      search: false,
      width: 120,
      render: (_, role) => (
        <Tag color={role.builtin ? 'blue' : 'default'}>
          {role.builtin ? tr('内置角色') : tr('自定义角色')}
        </Tag>
      ),
    },
    { title: tr('说明'), dataIndex: 'description', search: false, ellipsis: true, width: 280 },
    {
      title: tr('状态'),
      search: false,
      width: 100,
      render: (_, role) => (
        <Tag color={canSelect(role) ? 'success' : 'default'}>
          {canSelect(role) ? tr('可选择') : tr('不可选')}
        </Tag>
      ),
    },
  ]

  return (
    <>
      <SelectorField
        {...fieldProps}
        multiple={multiple}
        aria-label={fieldProps['aria-label'] ?? tr('选择角色')}
        placeholder={fieldProps.placeholder ?? tr('选择角色')}
        value={ids}
        options={ids.map((id) => {
          const role = roleById.get(id)
          return {
            value: id,
            label: role
              ? `${role.name}${role.builtin ? tr('（内置）') : ''}`
              : `${id} · ${tr('记录信息不可用')}`,
          }
        })}
        onChange={change}
        onOpen={() =>
          selectorRef.current?.show({
            value: ids,
            selectedRows: roles.filter((role) => ids.includes(role.id)),
          })
        }
      />
      <BasicTableSelector<RoleRecord>
        ref={selectorRef}
        title={tr('选择角色')}
        description={tr('浏览角色并添加到已选列表')}
        selectionTitle={tr('已选角色')}
        emptyDescription={tr('从左侧选择角色')}
        rowKey="id"
        multiple={multiple}
        modalProps={{
          centered: true,
        }}
        columns={columns}
        request={request}
        labelRender={(role) => `${role.name}${role.builtin ? tr('（内置）') : ''}`}
        getCheckboxProps={(role) => ({ disabled: !canSelect(role) })}
        onChange={(keys) => change(keys.map(String))}
      />
    </>
  )
}
