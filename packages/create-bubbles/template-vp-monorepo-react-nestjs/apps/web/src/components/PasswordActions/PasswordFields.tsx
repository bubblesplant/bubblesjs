import { ProFormText } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import styles from './PasswordFields.module.css'

/** 为本人改密与管理员重置提供相同的密码约束和不回填输入框。 */
export default function PasswordFields({ mode }: { mode: 'change' | 'reset' }) {
  const { tr } = useI18n()

  return (
    <div className={styles.fields}>
      {mode === 'change' && (
        <ProFormText.Password
          name="oldPassword"
          label={tr('旧密码')}
          fieldProps={{ autoComplete: 'off', maxLength: 128 }}
          rules={[{ required: true, message: tr('请输入旧密码') }]}
        />
      )}
      <ProFormText.Password
        name="newPassword"
        label={tr('新密码')}
        dependencies={mode === 'change' ? ['oldPassword'] : []}
        fieldProps={{ autoComplete: 'new-password', maxLength: 16 }}
        rules={[
          { required: true, message: tr('请输入新密码') },
          { min: 8, max: 16, message: tr('密码长度为 8–16 位') },
          ({ getFieldValue }) => ({
            /** 本人改密时不能再次使用输入的旧密码，服务端还会独立校验。 */
            validator: (_, value) =>
              mode === 'change' && value && value === getFieldValue('oldPassword')
                ? Promise.reject(new Error(tr('新密码不能与旧密码相同')))
                : Promise.resolve(),
          }),
        ]}
      />
      <ProFormText.Password
        name="confirmPassword"
        label={tr('确认密码')}
        dependencies={['newPassword']}
        fieldProps={{ autoComplete: 'new-password', maxLength: 16 }}
        rules={[
          { required: true, message: tr('请再次输入新密码') },
          ({ getFieldValue }) => ({
            /** 确认值必须与新密码逐字一致，不对密码做隐式裁剪。 */
            validator: (_, value) =>
              value === getFieldValue('newPassword')
                ? Promise.resolve()
                : Promise.reject(new Error(tr('两次输入的密码不一致'))),
          }),
        ]}
      />
    </div>
  )
}
