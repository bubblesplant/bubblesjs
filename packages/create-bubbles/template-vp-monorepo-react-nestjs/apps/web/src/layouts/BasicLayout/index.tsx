import { getRequestErrorMessage } from 'shared/utils'
import { logout } from '@/api/auth'
import Brand, { BrandMark } from '@/components/Brand/Brand'
import LocaleSwitch from '@/components/LocaleSwitch/LocaleSwitch'
import RouteTransition from '@/components/RouteTransition/RouteTransition'
import { workspaceLayoutToken } from '@/config/theme'
import { cookie } from '@/utils/storage/cookie'
import {
  DashboardOutlined,
  LogoutOutlined,
  TableOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { ProLayout } from '@ant-design/pro-components'
import { useRequest } from 'alova/client'
import { App, Button } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { I18nState } from '@bubblesjs/i18n-core'
import '../WorkspaceLayout/workspace.css'

/** 使用当前语言构建基础示例导航。 */
function createMenuRoutes(tr: I18nState['tr']) {
  return [
    { path: '/home', name: tr('工作台'), icon: <DashboardOutlined /> },
    {
      path: '/examples/pro-table',
      key: 'pro-table-examples',
      name: tr('ProTable 示例'),
      icon: <TableOutlined />,
      routes: [
        { path: '/examples/pro-table', key: 'pro-table-basic', name: tr('基础') },
        { path: '/examples/pro-table/draft', name: tr('草稿') },
      ],
    },
    { path: '/examples/i18n', name: tr('国际化示例'), icon: <TranslationOutlined /> },
  ]
}

/** 组织基础导航、登录入口及退出登录，页面懒加载交由全局边界等待。 */
export default function BasicLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = cookie.get('token')
  const { message } = App.useApp()
  const { tr } = useI18n()
  const { send, loading } = useRequest(logout, { immediate: false })
  const menuRoutes = createMenuRoutes(tr)

  /** 结束当前登录会话，清理本地令牌并返回登录页。 */
  async function handleLogout() {
    if (loading) return
    try {
      await send()
      cookie.remove('token')
      void navigate('/login', { replace: true })
    } catch (error) {
      void message.error(getRequestErrorMessage(error, tr('退出失败，请重试')))
    }
  }

  return (
    <ProLayout
      className="platform-layout workspace-layout"
      style={{ height: '100dvh', overflow: 'hidden' }}
      contentStyle={{ minHeight: 0, padding: 0, overflow: 'auto' }}
      title={tr('万物')}
      logo={<BrandMark />}
      token={workspaceLayoutToken}
      layout="mix"
      fixedHeader
      fixSiderbar
      siderWidth={224}
      actionsRender={() =>
        token
          ? [
              <LocaleSwitch key="locale" />,
              <Button
                key="logout"
                type="text"
                icon={<LogoutOutlined />}
                loading={loading}
                onClick={() => void handleLogout()}
              >
                {tr('退出登录')}
              </Button>,
            ]
          : [
              <LocaleSwitch key="locale" />,
              <Link key="login" to="/login">
                {tr('登录')}
              </Link>,
            ]
      }
      location={location}
      route={{ path: '/', routes: menuRoutes }}
      menu={{ locale: false }}
      menuProps={{
        selectedKeys: [
          location.pathname === '/examples/pro-table' ? 'pro-table-basic' : location.pathname,
        ],
      }}
      menuItemRender={(item, dom, { isMobile }) => (
        <Link to={item.path ?? '/home'} onClick={isMobile ? item.onClick : undefined}>
          {dom}
        </Link>
      )}
      headerTitleRender={() => <Brand variant="basic" to="/home" ariaLabel={tr('万物首页')} />}
    >
      <RouteTransition>
        <Outlet />
      </RouteTransition>
    </ProLayout>
  )
}
