import { DownOutlined, KeyOutlined, LogoutOutlined } from '@ant-design/icons'
import { useI18n } from '@bubblesjs/i18n-react'
import { Avatar, Button, Dropdown } from 'antd'
import './AccountMenu.css'

export interface AccountMenuRef {
  show: () => void
  hide: () => void
}

interface AccountMenuProps {
  user: { name: string; account: string }
  roleLabel?: string
  onChangePassword: () => void
  onLogout: () => void | Promise<void>
  ref?: Ref<AccountMenuRef>
}

/** 收纳本人账户操作，展示用户身份；改密及退出的业务行为由调用方提供。 */
export default function AccountMenu({
  user,
  roleLabel,
  onChangePassword,
  onLogout,
  ref,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const { tr } = useI18n()
  const initial = user.name.slice(0, 1).toUpperCase()

  /** 打开账户菜单，供外部入口或触发按钮使用。 */
  const show = () => setOpen(true)
  /** 收起账户菜单，避免执行账户操作后仍遮挡页面。 */
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({ show, hide }))

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      autoFocus
      destroyOnHidden
      open={open}
      onOpenChange={(visible) => (visible ? show() : hide())}
      classNames={{ root: 'workspace-account-dropdown' }}
      menu={{
        items: [
          { key: 'password', icon: <KeyOutlined />, label: tr('修改密码') },
          { type: 'divider' },
          { key: 'logout', icon: <LogoutOutlined />, label: tr('退出登录'), danger: true },
        ],
        onClick: ({ key }) => {
          hide()
          if (key === 'password') onChangePassword()
          if (key === 'logout') void onLogout()
        },
      }}
      popupRender={(menu) => (
        <div className="workspace-account-panel">
          <div className="workspace-account-identity">
            <Avatar size={40} aria-hidden="true">
              {initial}
            </Avatar>
            <div className="workspace-account-details">
              <strong>{user.name}</strong>
              <span>{user.account}</span>
              {roleLabel && <small>{roleLabel}</small>}
            </div>
          </div>
          {menu}
        </div>
      )}
    >
      <Button
        type="text"
        className="workspace-account-trigger"
        aria-label={tr('账户菜单')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar size={32} aria-hidden="true">
          {initial}
        </Avatar>
        <span className="workspace-account-name" title={user.name}>
          {user.name}
        </span>
        <DownOutlined className="workspace-account-chevron" aria-hidden="true" />
      </Button>
    </Dropdown>
  )
}
