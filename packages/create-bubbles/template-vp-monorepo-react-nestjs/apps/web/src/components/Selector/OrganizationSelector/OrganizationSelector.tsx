import { Alert, Input, Modal } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationDuty, OrganizationUnitNode } from 'shared/types'
import { getRequestErrorMessage } from 'shared/utils'
import type {
  OrganizationSelectorOpenOptions,
  OrganizationSelectorProps,
} from './OrganizationSelectorTypes'
import OrganizationSelectorTable from './OrganizationSelectorTable'
import AffiliationPicker from '../components/AffiliationPicker'
import styles from '../components/AffiliationPicker/AffiliationPicker.module.css'

/** 默认纯组织选择；启用职责后确认完整组织关系，保存失败保留当前草稿。 */
export default function OrganizationSelector(props: OrganizationSelectorProps) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<OrganizationSelectorOpenOptions>({ units: [] })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [duties, setDuties] = useState<Record<string, OrganizationDuty>>({})
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const savingRef = useRef(false)
  const { tr } = useI18n()

  /** 保存期间禁止关闭，避免丢失正在提交的会话。 */
  const hide = () => {
    if (!savingRef.current) setOpen(false)
  }
  useImperativeHandle(props.ref, () => ({
    /** 每次打开重置搜索和草稿；纯组织模式忽略职责回显。 */
    show: (nextOptions) => {
      if (savingRef.current) return
      const relations = props.enableDuties ? (nextOptions.relations ?? []) : []
      const uniqueIds = [
        ...new Set(nextOptions.value ?? relations.map((item) => item.organizationUnitId)),
      ]
      const ids = nextOptions.multiple === false ? uniqueIds.slice(0, 1) : uniqueIds
      const initialDuties = new Map(relations.map((item) => [item.organizationUnitId, item.duty]))
      setOptions(nextOptions)
      setSelectedIds(ids)
      setDuties(Object.fromEntries(ids.map((id) => [id, initialDuties.get(id) ?? 'member'])))
      setQuery('')
      setError(undefined)
      setOpen(true)
    },
    hide,
  }))

  /** 保留仍选中组织的职责，新增和重新选中的组织默认使用成员职责。 */
  const changeSelection = (ids: string[]) => {
    if (savingRef.current) return
    const uniqueIds = [...new Set(options.multiple === false ? ids.slice(0, 1) : ids)]
    setSelectedIds(uniqueIds)
    setDuties((current) => Object.fromEntries(uniqueIds.map((id) => [id, current[id] ?? 'member'])))
  }

  /** 同序输出值与完整组织记录；职责不混入原记录，失败保留草稿。 */
  const confirm = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(undefined)
    try {
      const unitById = new Map(options.units.map((unit) => [unit.id, unit]))
      const records = selectedIds
        .map((id) => unitById.get(id))
        .filter((unit): unit is OrganizationUnitNode => !!unit)
      const result = props.enableDuties
        ? await props.onConfirm(
            selectedIds.map((organizationUnitId) => ({
              organizationUnitId,
              duty: duties[organizationUnitId] ?? 'member',
            })),
            records,
          )
        : await props.onConfirm([...selectedIds], records)
      if (result !== false) setOpen(false)
    } catch (cause) {
      setError(getRequestErrorMessage(cause, tr('保存失败，请重试')))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const keyword = query.trim().toLocaleLowerCase()
  const visibleUnits = options.units.filter((unit) =>
    unit.fullPath.toLocaleLowerCase().includes(keyword),
  )
  return (
    <Modal
      title={options.title ?? tr('选择组织单元')}
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
        listTitle={tr('选择组织单元')}
        selectionTitle={tr('已选组织')}
        emptyText={tr('从左侧选择组织')}
        removeLabel={(name) => tr('移除组织 {name}', { name })}
        items={options.units.map((unit) => ({ id: unit.id, label: unit.fullPath }))}
        selectedIds={selectedIds}
        disabled={saving}
        onChange={changeSelection}
      >
        <Input
          value={query}
          allowClear
          disabled={saving}
          placeholder={tr('搜索组织名称或路径')}
          aria-label={tr('搜索组织名称或路径')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <OrganizationSelectorTable
          multiple={options.multiple !== false}
          units={visibleUnits}
          selectedIds={selectedIds}
          duties={duties}
          saving={saving}
          enableDuties={props.enableDuties === true}
          isOrganizationDisabled={options.isOrganizationDisabled}
          isDutyDisabled={options.isDutyDisabled}
          onChange={changeSelection}
          onDutyChange={(id, duty) => {
            if (!savingRef.current) setDuties((current) => ({ ...current, [id]: duty }))
          }}
        />
      </AffiliationPicker>
    </Modal>
  )
}
