import { Alert, Input, Modal, Table, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { PositionRecord } from 'shared/types'
import { getRequestErrorMessage } from 'shared/utils'
import AffiliationPicker from '../components/AffiliationPicker'
import styles from '../components/AffiliationPicker/AffiliationPicker.module.css'
import type { PositionSelectorOpenOptions, PositionSelectorProps } from './PositionSelectorTypes'

/** 独立岗位选择会话；确认失败保留草稿，保存期间锁定编辑与关闭。 */
export default function PositionSelector({ ref, onConfirm }: PositionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<PositionSelectorOpenOptions>({ positions: [] })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const savingRef = useRef(false)
  const { tr } = useI18n()

  /** 保存期间禁止关闭，避免丢失正在提交的选择会话。 */
  const hide = () => {
    if (!savingRef.current) setOpen(false)
  }
  useImperativeHandle(ref, () => ({
    /** 带入最新候选与选中值，并清除上次搜索和失败提示。 */
    show: (next) => {
      if (savingRef.current) return
      setOptions(next)
      const ids = [...new Set(next.value ?? [])]
      setSelectedIds(next.multiple === false ? ids.slice(0, 1) : ids)
      setQuery('')
      setError(undefined)
      setOpen(true)
    },
    hide,
  }))

  /** 只修改当前弹窗草稿；候选禁选不阻止移除已有关系。 */
  const changeSelection = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)]
    if (!savingRef.current)
      setSelectedIds(options.multiple === false ? uniqueIds.slice(0, 1) : uniqueIds)
  }

  /** 同序输出值与完整岗位记录；返回 false 或抛错保留草稿并防止重复提交。 */
  const confirm = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(undefined)
    try {
      const positionById = new Map(options.positions.map((position) => [position.id, position]))
      const records = selectedIds
        .map((id) => positionById.get(id))
        .filter((position): position is PositionRecord => !!position)
      if ((await onConfirm([...selectedIds], records)) !== false) setOpen(false)
    } catch (cause) {
      setError(getRequestErrorMessage(cause, tr('保存失败，请重试')))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const keyword = query.trim().toLocaleLowerCase()
  const visiblePositions = options.positions.filter((position) =>
    `${position.name} ${position.code}`.toLocaleLowerCase().includes(keyword),
  )
  return (
    <Modal
      title={options.title ?? tr('选择岗位')}
      open={open}
      width={1040}
      centered
      className={styles.modal}
      styles={{ body: { maxHeight: 'calc(100dvh - 180px)', overflow: 'auto' } }}
      destroyOnHidden
      confirmLoading={saving}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      keyboard={!saving}
      mask={{ closable: !saving }}
      onCancel={hide}
      onOk={confirm}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          title={tr('保存失败，请重试')}
          description={error}
          style={{ marginBottom: 16 }}
        />
      ) : (
        options.description && <div style={{ marginBottom: 16 }}>{options.description}</div>
      )}
      <AffiliationPicker
        listTitle={tr('选择岗位')}
        selectionTitle={tr('已选岗位')}
        emptyText={tr('从左侧选择岗位')}
        removeLabel={(name) => tr('移除岗位 {name}', { name })}
        items={options.positions.map((position) => ({
          id: position.id,
          label: `${position.name} · ${position.code}`,
        }))}
        selectedIds={selectedIds}
        disabled={saving}
        onChange={changeSelection}
      >
        <Input
          value={query}
          allowClear
          disabled={saving}
          placeholder={tr('搜索岗位名称或编码')}
          aria-label={tr('搜索岗位名称或编码')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Table<PositionRecord>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={visiblePositions}
          scroll={{ y: 330 }}
          rowSelection={{
            type: options.multiple === false ? 'radio' : 'checkbox',
            selectedRowKeys: selectedIds,
            preserveSelectedRowKeys: true,
            getCheckboxProps: (position) => ({
              disabled:
                saving ||
                (!selectedIds.includes(position.id) &&
                  (options.isPositionDisabled?.(position) ?? position.status !== 'active')),
            }),
            onChange: (keys) => changeSelection(keys.map(String)),
          }}
          columns={[
            {
              title: tr('岗位名称'),
              dataIndex: 'name',
              render: (name: string) => <span className={styles.path}>{name}</span>,
            },
            {
              title: tr('岗位编码'),
              dataIndex: 'code',
              width: 130,
              render: (code: string) => <span className={styles.path}>{code}</span>,
            },
            {
              title: tr('状态'),
              dataIndex: 'status',
              width: 80,
              render: (status: PositionRecord['status']) => (
                <Tag color={status === 'active' ? 'green' : 'default'}>
                  {status === 'active' ? tr('启用') : tr('停用')}
                </Tag>
              ),
            },
          ]}
        />
      </AffiliationPicker>
    </Modal>
  )
}
