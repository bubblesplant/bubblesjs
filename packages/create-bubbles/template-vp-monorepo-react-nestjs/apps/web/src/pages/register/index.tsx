import { ArrowRightOutlined } from '@ant-design/icons'
import { LoginForm, ProFormText } from '@ant-design/pro-components'
import { useRequest } from 'alova/client'
import { Alert } from 'antd'
import type { RegisterRequest } from 'shared/types'
import { ACCOUNT_PATTERN, normalizeAccount } from 'shared/utils'
import { useI18n } from '@bubblesjs/i18n-react'
import Brand from '@/components/Brand/Brand'
import LocaleSwitch from '@/components/LocaleSwitch/LocaleSwitch'
import { buildAuthPath, safeNextPath } from '@/utils/safe-next'
import { register } from './api'
import '../login/login.css'

/** 展示注册表单，校验账号及确认密码后引导登录。 */
export default function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { send, loading } = useRequest(register, { immediate: false })
  const [error, setError] = useState<string | null>(null)
  const { tr } = useI18n()
  const next = safeNextPath(searchParams.get('next'))

  /** 规范化注册资料并提交账号创建，成功后返回登录入口。 */
  async function handleRegister(values: RegisterRequest) {
    if (loading) return false
    setError(null)
    try {
      await send({
        password: values.password,
        account: normalizeAccount(values.account),
        name: values.name.trim(),
      })
      void navigate(buildAuthPath('/login', { next, registered: true }), { replace: true })
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('注册失败，请稍后重试'))
      return false
    }
  }

  return (
    <main className="login-page login-page-register">
      <title>{tr('注册 - 万物')}</title>
      <section className="login-brand-panel" aria-label={tr('万物')}>
        <Brand variant="auth" />
        <div className="login-story">
          <div className="login-orbit" aria-hidden="true">
            <span className="login-pearl" />
            <span className="login-orbit-ring" />
            <span className="login-orbit-satellite" />
          </div>
          <p className="login-eyebrow">WANWU</p>
          <h1>{tr('万物')}</h1>
          <p className="login-story-caption">{tr('企业与项目工作空间')}</p>
        </div>
        <div className="login-brand-footer">
          <span>{tr('一个账号，访问你加入的企业和项目。')}</span>
        </div>
      </section>
      <section className="login-form-panel" aria-labelledby="register-title">
        <div className="login-locale-switch">
          <LocaleSwitch />
        </div>
        <div className="login-form-content">
          <p className="login-form-eyebrow">{tr('加入万物')}</p>
          <h2 id="register-title">{tr('创建账号')}</h2>
          <p className="login-description">
            {tr('注册后登录，即可接受邀请或进入已加入的工作空间。')}
          </p>
          <LoginForm<RegisterRequest>
            autoFocusFirstInput={false}
            requiredMark={false}
            contentStyle={{ width: '100%', minWidth: 0 }}
            containerStyle={{ padding: 0, minWidth: 0 }}
            onFinish={handleRegister}
            submitter={{
              searchConfig: { submitText: tr('注册账号') },
              submitButtonProps: {
                loading,
                size: 'large',
                icon: <ArrowRightOutlined />,
                iconPlacement: 'end',
              },
            }}
          >
            {error && (
              <Alert className="login-error" type="error" showIcon title={error} role="alert" />
            )}
            <ProFormText
              name="name"
              label={tr('姓名')}
              fieldProps={{ maxLength: 100, autoComplete: 'name', size: 'large' }}
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
              extra={tr('4–32 位字母、数字或下划线。')}
              fieldProps={{
                maxLength: 32,
                autoComplete: 'username',
                autoCapitalize: 'none',
                spellCheck: false,
                size: 'large',
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
              label={tr('密码')}
              fieldProps={{ maxLength: 16, autoComplete: 'new-password', size: 'large' }}
              rules={[
                { required: true, message: tr('请输入密码') },
                { min: 8, max: 16, message: tr('密码长度为 8–16 位') },
              ]}
            />
            <ProFormText.Password
              name="confirmPassword"
              label={tr('确认密码')}
              dependencies={['password']}
              fieldProps={{ maxLength: 16, autoComplete: 'new-password', size: 'large' }}
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
          </LoginForm>
          <p className="login-account-hint">
            {tr('已有账号？')}
            <Link to={buildAuthPath('/login', { next })}>{tr('返回登录')}</Link>
          </p>
        </div>
        <footer className="login-footer">{tr('万物 · 工作空间')}</footer>
      </section>
    </main>
  )
}
