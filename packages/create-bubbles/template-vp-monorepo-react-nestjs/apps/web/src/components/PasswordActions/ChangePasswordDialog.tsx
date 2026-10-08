import { ModalForm } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import { useRequest } from 'alova/client'
import { Alert, Form } from 'antd'
import type { ChangePasswordRequest } from 'shared/types'
import { changePassword } from '@/api/auth'
import PasswordFields from './PasswordFields'
import { changePasswordAndClearSession } from './change-password-session'

export interface ChangePasswordDialogRef {
  show: () => void
  hide: () => void
}

/** 验证当前密码后更新全局账号密码，成功时清理旧会话并转向登录。 */
export default function ChangePasswordDialog({ ref }: { ref: Ref<ChangePasswordDialogRef> }) {
  const [form] = Form.useForm<ChangePasswordRequest>()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const { send, loading } = useRequest(changePassword, { immediate: false })
  const navigate = useNavigate()
  const { tr } = useI18n()

  /** 每次打开均清空全部密码和上一次错误。 */
  const show = () => {
    form.resetFields()
    setError(null)
    setOpen(true)
  }
  /** 关闭表单时清除密码，提交期间不允许关闭并遗留在途操作。 */
  const hide = () => {
    if (pending.current) return
    form.resetFields()
    setError(null)
    setOpen(false)
  }
  useImperativeHandle(ref, () => ({ show, hide }))

  /** 仅在服务器确认密码及全终端会话撤销成功后删除本地凭据。 */
  async function submit(values: ChangePasswordRequest) {
    if (pending.current) return false
    pending.current = true
    setError(null)
    try {
      await changePasswordAndClearSession(values, send)
      form.resetFields()
      setOpen(false)
      void navigate('/login', { replace: true, state: { passwordChanged: true } })
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('修改密码失败，请重试'))
      return false
    } finally {
      pending.current = false
    }
  }

  return (
    <ModalForm<ChangePasswordRequest>
      title={tr('修改密码')}
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
        searchConfig: { submitText: tr('确认修改') },
        submitButtonProps: { loading },
      }}
      onFinish={submit}
    >
      <Alert
        type="info"
        showIcon
        title={tr('修改成功后，所有终端都需要使用新密码重新登录。')}
        style={{ marginBottom: 20 }}
      />
      {error && (
        <Alert type="error" showIcon title={error} role="alert" style={{ marginBottom: 20 }} />
      )}
      <PasswordFields mode="change" />
    </ModalForm>
  )
}
