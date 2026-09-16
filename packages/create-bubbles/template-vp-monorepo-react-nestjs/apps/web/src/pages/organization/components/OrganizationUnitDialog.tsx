import { ModalForm, ProFormDigit, ProFormText, ProFormTextArea } from '@ant-design/pro-components'
import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CreateOrganizationUnitRequest, OrganizationUnitRecord } from 'shared/types'

export interface OrganizationUnitDialogRef {
  show: (record?: OrganizationUnitRecord, parentId?: string | null) => void
  hide: () => void
}

/** 新增或编辑组织单元；父级变更由独立移动操作负责。 */
export default function OrganizationUnitDialog({
  ref,
  onSave,
}: {
  ref: Ref<OrganizationUnitDialogRef>
  onSave: (
    values: CreateOrganizationUnitRequest,
    record?: OrganizationUnitRecord,
  ) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<OrganizationUnitRecord>()
  const [parentId, setParentId] = useState<string | null>(null)
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 载入编辑记录或新节点父级并打开表单。 */
    show: (item, nextParentId = null) => {
      setRecord(item)
      setParentId(item?.parentId ?? nextParentId)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<CreateOrganizationUnitRequest>
      title={record ? tr('编辑组织单元') : tr('创建组织单元')}
      open={open}
      width={580}
      initialValues={record ?? { sort: 1 }}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存组织单元') } }}
      onFinish={
        /** 规范化名称、编码和说明，并在新增时带入选定父级。 */ async (values) => {
          const ok = await onSave(
            {
              ...(!record ? { parentId } : {}),
              name: values.name.trim(),
              code: values.code.trim().toLowerCase(),
              description: values.description?.trim(),
              sort: values.sort,
            },
            record,
          )
          if (ok) hide()
          return ok
        }
      }
    >
      {!record && parentId && (
        <Alert
          type="info"
          showIcon
          title={tr('将在当前选中的组织单元下创建子级')}
          style={{ marginBottom: 20 }}
        />
      )}
      <ProFormText
        name="name"
        label={tr('组织单元名称')}
        rules={[
          {
            required: true,
            whitespace: true,
            min: 2,
            max: 100,
            message: tr('请输入 2–100 字组织单元名称'),
          },
        ]}
        fieldProps={{ maxLength: 100 }}
      />
      <ProFormText
        name="code"
        label={tr('组织单元编码')}
        extra={tr('编码在当前组织树中唯一，保存时转为小写。')}
        rules={[
          { required: true, pattern: /^[A-Za-z0-9_-]{2,32}$/, message: tr('请输入有效编码') },
        ]}
        fieldProps={{ maxLength: 32 }}
      />
      <ProFormDigit
        name="sort"
        label={tr('排序')}
        min={0}
        max={999999999}
        fieldProps={{ precision: 0 }}
        rules={[{ required: true, message: tr('请输入排序整数') }]}
      />
      <ProFormTextArea
        name="description"
        label={tr('说明')}
        fieldProps={{ maxLength: 500, showCount: true, rows: 3 }}
      />
    </ModalForm>
  )
}
