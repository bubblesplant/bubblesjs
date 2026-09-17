import { ModalForm, ProFormText } from '@ant-design/pro-components'
import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { RegisterCompanyMemberRequest } from 'shared/types'
import { ACCOUNT_PATTERN, normalizeAccount } from 'shared/utils'
import styles from './RegisterCompanyMemberDialog.module.css'

interface RegisterCompanyMemberFormValues extends RegisterCompanyMemberRequest {
  confirmPassword: string
}

export interface RegisterCompanyMemberDialogRef {
  show: () => void
  hide: () => void
}

/** 由企业管理员直接创建账号，并在保存成功后关闭企业成员注册弹窗。 */
export default function RegisterCompanyMemberDialog({
  ref,
  onSave,
}: {
  ref: Ref<RegisterCompanyMemberDialogRef>
  onSave: (data: RegisterCompanyMemberRequest) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({ show: () => setOpen(true), hide }))

  return (
    <ModalForm<RegisterCompanyMemberFormValues>
      title={tr('直接注册企业成员')}
      open={open}
      width={560}
      modalProps={{
        destroyOnHidden: true,
        rootClassName: styles.dialog,
        onCancel: hide,
      }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('注册并加入企业') } }}
      onFinish={
        /** 规范化账号与姓名，只向服务端提交注册所需字段。 */ async (values) => {
          const ok = await onSave({
            name: values.name.trim(),
            account: normalizeAccount(values.account),
            password: values.password,
          })
          if (ok) hide()
          return ok
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('账号创建后会立即加入当前企业')}
        description={tr('请将初始账号和密码安全地交给成员，并提醒其首次登录后妥善保管。')}
        style={{ marginBottom: 20 }}
      />
      <ProFormText
        name="name"
        label={tr('姓名')}
        fieldProps={{ maxLength: 100, autoComplete: 'name' }}
        rules={[
          {
            required: true,
            whitespace: true,
            min: 2,
            max: 100,
            message: tr('请输入 2–100 字姓名'),
          },
        ]}
      />
      <ProFormText
        name="account"
        label={tr('账号')}
        extra={tr('4–32 位字母、数字或下划线；账号已存在时请改用邀请流程。')}
        fieldProps={{
          maxLength: 32,
          autoComplete: 'username',
          autoCapitalize: 'none',
          spellCheck: false,
        }}
        rules={[
          { required: true, message: tr('请输入账号') },
          {
            pattern: ACCOUNT_PATTERN,
            transform: (value: string) => value?.trim(),
            message: tr('请输入 4–32 位字母、数字或下划线'),
          },
        ]}
      />
      <ProFormText.Password
        name="password"
        label={tr('初始密码')}
        fieldProps={{ maxLength: 16, autoComplete: 'new-password' }}
        rules={[
          { required: true, message: tr('请输入密码') },
          { min: 8, max: 16, message: tr('密码长度为 8–16 位') },
        ]}
      />
      <ProFormText.Password
        name="confirmPassword"
        label={tr('确认密码')}
        dependencies={['password']}
        fieldProps={{ maxLength: 16, autoComplete: 'new-password' }}
        rules={[
          { required: true, message: tr('请再次输入密码') },
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              value === getFieldValue('password')
                ? Promise.resolve()
                : Promise.reject(new Error(tr('两次输入的密码不一致'))),
          }),
        ]}
      />
    </ModalForm>
  )
}
