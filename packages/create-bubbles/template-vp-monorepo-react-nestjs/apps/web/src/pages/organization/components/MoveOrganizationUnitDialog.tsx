import { ModalForm, ProFormDigit, ProFormSelect } from '@ant-design/pro-components'
import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { MoveOrganizationUnitRequest, OrganizationUnitRecord } from 'shared/types'

const ROOT_VALUE = '__organization_root__'

export interface MoveOrganizationUnitDialogRef {
  show: (record: OrganizationUnitRecord, options: Array<{ value: string; label: string }>) => void
  hide: () => void
}

/** 移动组织单元并可同时更新目标同级排序。 */
export default function MoveOrganizationUnitDialog({
  ref,
  onSave,
}: {
  ref: Ref<MoveOrganizationUnitDialogRef>
  onSave: (record: OrganizationUnitRecord, values: MoveOrganizationUnitRequest) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<OrganizationUnitRecord>()
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([])
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 带入当前节点和可选父级列表后打开移动弹窗。 */
    show: (item, parentOptions) => {
      setRecord(item)
      setOptions(parentOptions)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<{ parentId: string; sort?: number }>
      title={tr('移动组织单元 · {name}', { name: record?.name ?? '' })}
      open={open}
      width={560}
      initialValues={{ parentId: record?.parentId ?? ROOT_VALUE, sort: record?.sort }}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('确认移动') } }}
      onFinish={
        /** 将虚拟根转换为 null，并携带当前乐观锁版本提交。 */ async (values) => {
          if (!record) return false
          const ok = await onSave(record, {
            parentId: values.parentId === ROOT_VALUE ? null : values.parentId,
            sort: values.sort,
            expectedVersion: record.version,
          })
          if (ok) hide()
          return ok
        }
      }
    >
      <Alert
        type="warning"
        showIcon
        title={tr('移动会改变本节点及全部后代的完整路径')}
        description={tr('最多允许 10 层；循环和无效目标会由服务端拒绝。')}
        style={{ marginBottom: 20 }}
      />
      <ProFormSelect
        name="parentId"
        label={tr('新父级')}
        options={[{ value: ROOT_VALUE, label: tr('组织根节点') }, ...options]}
        rules={[{ required: true, message: tr('请选择新父级') }]}
        fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
      />
      <ProFormDigit
        name="sort"
        label={tr('新排序')}
        min={0}
        max={999999999}
        fieldProps={{ precision: 0 }}
      />
    </ModalForm>
  )
}
