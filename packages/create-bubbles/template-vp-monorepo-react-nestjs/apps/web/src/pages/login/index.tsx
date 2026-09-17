import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { LoginForm, ProFormText } from '@ant-design/pro-components'
import { useRequest } from 'alova/client'
import { Alert } from 'antd'
import type { LoginRequest } from 'shared/types'
import { ACCOUNT_PATTERN, normalizeAccount } from 'shared/utils'
import { useI18n } from '@bubblesjs/i18n-react'
import Brand from '@/components/Brand/Brand'
import LocaleSwitch from '@/components/LocaleSwitch/LocaleSwitch'
import { cookie } from '@/utils/storage/cookie'
import { buildAuthPath, safeNextPath } from '@/utils/safe-next'
import { login } from './api'
import './login.css'

/** 展示登录表单，保存会话令牌并跳转到登录后的入口。 */
export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { send, loading } = useRequest(login, { immediate: false })
  const [error, setError] = useState<string | null>(null)
  const { tr } = useI18n()
  const next = safeNextPath(searchParams.get('next'))

  /** 规范化账号并提交登录，将令牌按服务端绝对过期时间保存。 */
  async function handleLogin(values: LoginRequest) {
    if (loading) return false
    setError(null)
    try {
      const result = await send({
        account: normalizeAccount(values.account),
        password: values.password,
      })
      cookie.set('token', result.accessToken, {
        expires: new Date(result.absoluteExpiresAt),
      })
      void navigate(next, { replace: true })
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('登录失败，请稍后重试'))
      return false
    }
  }

  return (
    <main className="login-page">
      <title>{tr('登录 - 万物')}</title>
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
          <span>{tr('登录后，选择你的工作空间。')}</span>
        </div>
      </section>

      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-locale-switch">
          <LocaleSwitch />
        </div>
        <div className="login-form-content">
          <p className="login-form-eyebrow">{tr('账号登录')}</p>
          <h2 id="login-title">{tr('欢迎回到万物')}</h2>
          <p className="login-description">{tr('登录账号，进入你的工作空间。')}</p>
          <LoginForm<LoginRequest>
            autoFocusFirstInput={false}
            requiredMark={false}
            contentStyle={{ width: '100%', minWidth: 0 }}
            containerStyle={{ padding: 0, minWidth: 0 }}
            onFinish={handleLogin}
            onValuesChange={() => {
              if (error) setError(null)
            }}
            submitter={{
              searchConfig: { submitText: tr('登录') },
              submitButtonProps: {
                size: 'large',
                loading,
                icon: <ArrowRightOutlined />,
                iconPlacement: 'end',
              },
            }}
          >
            {searchParams.has('registered') && (
              <Alert
                className="login-error"
                type="success"
                showIcon
                title={tr('账号已创建，请登录后继续。')}
              />
            )}
            {error && (
              <Alert className="login-error" type="error" showIcon title={error} role="alert" />
            )}
            <ProFormText
              name="account"
              label={tr('账号')}
              placeholder={tr('请输入账号')}
              fieldProps={{
                prefix: <UserOutlined />,
                autoComplete: 'username',
                maxLength: 32,
                size: 'large',
                autoCapitalize: 'none',
                spellCheck: false,
              }}
              rules={[
                { required: true, whitespace: true, message: tr('请输入账号') },
                {
                  min: 4,
                  max: 32,
                  transform: (value: string) => value?.trim(),
                  message: tr('账号长度为 4–32 位'),
                },
                {
                  pattern: ACCOUNT_PATTERN,
                  transform: (value: string) => value?.trim(),
                  message: tr('账号仅支持字母、数字和下划线'),
                },
              ]}
            />
            <ProFormText.Password
              name="password"
              label={tr('密码')}
              placeholder={tr('请输入密码')}
              fieldProps={{
                prefix: <LockOutlined />,
                autoComplete: 'current-password',
                maxLength: 128,
                size: 'large',
              }}
              rules={[
                { required: true, message: tr('请输入密码') },
                { max: 128, message: tr('密码不能超过 128 位') },
              ]}
            />
          </LoginForm>
          <p className="login-account-hint">
            {tr('还没有账号？')}
            <Link to={buildAuthPath('/register', { next })}>{tr('注册账号')}</Link>
          </p>
        </div>
        <footer className="login-footer">{tr('万物 · 工作空间')}</footer>
      </section>
    </main>
  )
}
