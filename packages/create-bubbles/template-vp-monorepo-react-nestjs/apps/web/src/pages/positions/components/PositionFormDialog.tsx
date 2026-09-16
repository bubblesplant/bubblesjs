import { ModalForm, ProFormText, ProFormTextArea } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CreatePositionRequest, PositionRecord } from 'shared/types'

export interface PositionFormDialogRef {
  show: (record?: PositionRecord) => void
  hide: () => void
}

/** 复用新增和编辑岗位表单；岗位是作用域平面列表，不包含组织字段。 */
export default function PositionFormDialog({
  ref,
  onSave,
}: {
  ref: Ref<PositionFormDialogRef>
  onSave: (values: CreatePositionRequest, record?: PositionRecord) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<PositionRecord>()
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 载入岗位快照并打开表单；省略记录时进入新增模式。 */
    show: (item) => {
      setRecord(item)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<CreatePositionRequest>
      title={record ? tr('编辑岗位') : tr('创建岗位')}
      open={open}
      width={560}
      initialValues={record}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存岗位') } }}
      onFinish={
        /** 规范化岗位文本后提交，成功时关闭弹窗。 */ async (values) => {
          const ok = await onSave(
            {
              name: values.name.trim(),
              code: values.code.trim().toLowerCase(),
              description: values.description?.trim(),
            },
            record,
          )
          if (ok) hide()
          return ok
        }
      }
    >
      <ProFormText
        name="name"
        label={tr('岗位名称')}
        rules={[
          {
            required: true,
            whitespace: true,
            min: 2,
            max: 100,
            message: tr('请输入 2–100 字岗位名称'),
          },
        ]}
        fieldProps={{ maxLength: 100 }}
      />
      <ProFormText
        name="code"
        label={tr('岗位编码')}
        extra={tr('2–32 位字母、数字、下划线或短横线。')}
        rules={[
          { required: true, pattern: /^[A-Za-z0-9_-]{2,32}$/, message: tr('请输入有效编码') },
        ]}
        fieldProps={{ maxLength: 32 }}
      />
      <ProFormTextArea
        name="description"
        label={tr('岗位说明')}
        fieldProps={{ maxLength: 500, showCount: true, rows: 3 }}
      />
    </ModalForm>
  )
}
