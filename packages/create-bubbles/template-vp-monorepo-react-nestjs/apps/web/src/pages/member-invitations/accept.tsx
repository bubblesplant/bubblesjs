import {
  ArrowRightOutlined,
  LoginOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useRequest } from 'alova/client'
import { Alert, App, Button, Space } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import Brand from '@/components/Brand/Brand'
import LocaleSwitch from '@/components/LocaleSwitch/LocaleSwitch'
import { buildAuthPath, safeNextPath } from '@/utils/safe-next'
import { cookie } from '@/utils/storage/cookie'
import { acceptCompanyMemberInvitation } from './api'
import '../login/login.css'
import './accept.css'

/** 展示一次性邀请凭证，并仅在已登录用户主动确认后接受邀请。 */
export default function CompanyMemberInvitationAcceptPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { send, loading } = useRequest(acceptCompanyMemberInvitation, { immediate: false })
  const [error, setError] = useState<string | null>(null)
  const { message } = App.useApp()
  const { tr } = useI18n()
  const token = searchParams.get('token')?.trim() ?? ''
  const authenticated = Boolean(cookie.get('token'))
  const next = safeNextPath(`${location.pathname}${location.search}`, '/member-invitations/accept')

  /** 将当前 token 作为唯一请求字段提交，登录失效时保留邀请地址返回登录页。 */
  async function handleAccept() {
    if (!token || loading) return
    setError(null)
    try {
      await send({ token })
      void message.success(tr('已加入企业'))
      void navigate('/workspaces', { replace: true })
    } catch (cause) {
      if ((cause as { status?: number }).status === 401) {
        cookie.remove('token')
        void navigate(buildAuthPath('/login', { next }), { replace: true })
        return
      }
      setError(cause instanceof Error ? cause.message : tr('接受邀请失败，请稍后重试'))
    }
  }

  return (
    <main className="login-page invitation-accept-page">
      <title>{tr('接受企业邀请 - 万物')}</title>
      <section className="login-brand-panel" aria-label={tr('万物')}>
        <Brand variant="auth" />
        <div className="login-story">
          <div className="login-orbit" aria-hidden="true">
            <span className="login-pearl" />
            <span className="login-orbit-ring" />
            <span className="login-orbit-satellite" />
          </div>
          <p className="login-eyebrow">INVITATION</p>
          <h1>{tr('邀请')}</h1>
          <p className="login-story-caption">{tr('一次性企业成员邀请')}</p>
        </div>
        <div className="login-brand-footer">
          <span>{tr('链接只可成功使用一次，请勿转发给无关人员。')}</span>
        </div>
      </section>

      <section className="login-form-panel" aria-labelledby="invitation-title">
        <div className="login-locale-switch">
          <LocaleSwitch />
        </div>
        <div className="login-form-content invitation-accept-card">
          <div className="invitation-ticket-mark" aria-hidden="true">
            <SafetyCertificateOutlined />
          </div>
          <p className="login-form-eyebrow">{tr('企业成员邀请')}</p>
          <h2 id="invitation-title">{tr('接受邀请并加入企业')}</h2>
          <p className="login-description">
            {tr('系统只会在你点击确认后，将当前登录账号加入发出邀请的企业。')}
          </p>

          {!token ? (
            <>
              <Alert
                type="error"
                showIcon
                title={tr('邀请链接无效')}
                description={tr('链接中缺少邀请凭证，请向企业管理员重新获取邀请链接。')}
              />
              <Button block size="large" onClick={() => void navigate('/workspaces')}>
                {tr('返回工作空间')}
              </Button>
            </>
          ) : !authenticated ? (
            <>
              <Alert
                type="info"
                showIcon
                title={tr('登录后再确认加入')}
                description={tr('登录或注册完成后会返回此页面，邀请不会被自动接受。')}
              />
              <Space direction="vertical" size="middle" className="invitation-auth-actions">
                <Link to={buildAuthPath('/login', { next })}>
                  <Button block type="primary" size="large" icon={<LoginOutlined />}>
                    {tr('登录并继续')}
                  </Button>
                </Link>
                <Link to={buildAuthPath('/register', { next })}>
                  <Button block size="large" icon={<UserAddOutlined />}>
                    {tr('注册账号')}
                  </Button>
                </Link>
              </Space>
            </>
          ) : (
            <>
              <Alert
                type="warning"
                showIcon
                title={tr('确认使用当前账号加入企业')}
                description={tr('确认后该邀请立即失效，无法转交给其他账号使用。')}
              />
              {error && <Alert type="error" showIcon title={error} role="alert" />}
              <Button
                block
                type="primary"
                size="large"
                loading={loading}
                icon={<ArrowRightOutlined />}
                iconPlacement="end"
                onClick={() => void handleAccept()}
              >
                {tr('确认加入企业')}
              </Button>
            </>
          )}
        </div>
        <footer className="login-footer">{tr('万物 · 工作空间')}</footer>
      </section>
    </main>
  )
}
