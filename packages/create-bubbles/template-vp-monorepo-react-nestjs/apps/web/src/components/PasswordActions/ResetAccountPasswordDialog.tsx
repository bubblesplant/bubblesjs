import { ModalForm } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import { Alert, App, Form } from 'antd'
import type { AccountRecord, ResetAccountPasswordRequest } from 'shared/types'
import PasswordFields from './PasswordFields'

export interface ResetAccountPasswordDialogRef {
  show: (record: AccountRecord) => void
  hide: () => void
}

/** 只接收目标公开资料和提交方法，不保留或回显目标的新密码。 */
export default function ResetAccountPasswordDialog({
  ref,
  onSave,
}: {
  ref: Ref<ResetAccountPasswordDialogRef>
  onSave: (record: AccountRecord, values: ResetAccountPasswordRequest) => Promise<void>
}) {
  const [form] = Form.useForm<ResetAccountPasswordRequest>()
  const [record, setRecord] = useState<AccountRecord>()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const { message } = App.useApp()
  const { tr } = useI18n()

  /** 打开目标账号表单前丢弃上一次输入和错误。 */
  const show = (target: AccountRecord) => {
    form.resetFields()
    setError(null)
    setRecord(target)
    setOpen(true)
  }
  /** 关闭时清空密码和目标，提交期间保持目标绑定。 */
  const hide = () => {
    if (pending.current) return
    form.resetFields()
    setError(null)
    setOpen(false)
    setRecord(undefined)
  }
  useImperativeHandle(ref, () => ({ show, hide }))

  /** 服务端确认重置及目标会话撤销成功后才显示线下告知提示。 */
  async function submit(values: ResetAccountPasswordRequest) {
    if (pending.current || !record) return false
    pending.current = true
    setSubmitting(true)
    setError(null)
    try {
      await onSave(record, values)
      form.resetFields()
      setOpen(false)
      setRecord(undefined)
      void message.success(tr('密码已重置，请通过现有线下渠道告知用户。'))
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('重置密码失败，请重试'))
      return false
    } finally {
      pending.current = false
      setSubmitting(false)
    }
  }

  return (
    <ModalForm<ResetAccountPasswordRequest>
      title={tr('重置密码 · {name}', { name: record?.name ?? '' })}
      open={open}
      form={form}
      width={460}
      modalProps={{ destroyOnHidden: true, maskClosable: false, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      onValuesChange={() => {
        if (error) setError(null)
      }}
      submitter={{
        searchConfig: { submitText: tr('确认重置') },
        submitButtonProps: { loading: submitting },
      }}
      onFinish={submit}
    >
      <Alert
        type="info"
        showIcon
        title={tr('目标账号：{account}', { account: record?.account ?? '' })}
        description={tr('重置成功后，目标账号的所有终端会话失效。请通过现有线下渠道告知用户。')}
        style={{ marginBottom: 20 }}
      />
      {error && (
        <Alert type="error" showIcon title={error} role="alert" style={{ marginBottom: 20 }} />
      )}
      <PasswordFields mode="reset" />
    </ModalForm>
  )
}
