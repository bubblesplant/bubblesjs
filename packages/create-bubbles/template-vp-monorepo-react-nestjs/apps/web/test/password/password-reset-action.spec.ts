import type { I18nState } from '@bubblesjs/i18n-core'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { AccountRecord } from 'shared/types'
import { createMemberTableColumns } from '../../src/pages/access/components/MemberTable'

const tr = ((key: string) => key) as I18nState['tr']
const target: AccountRecord = {
  id: 'target',
  account: 'target_account',
  name: '目标用户',
  status: 'locked',
  createdAt: '',
  updatedAt: '',
  platformRoleIds: [],
}

/** 生成只开放改密操作的列，检查平台账号行的目标过滤和事件绑定。 */
function resetAction(options: { currentUserId: string; canResetPassword: boolean }) {
  const onResetPassword = vi.fn()
  const columns = createMemberTableColumns({
    platform: true,
    currentUserId: options.currentUserId,
    companyScope: false,
    canReadOrganization: false,
    canAssignOrganization: false,
    canAssignPositions: false,
    canManageRoles: false,
    canManageStatus: false,
    canResetPassword: options.canResetPassword,
    canRemove: false,
    candidateByUserId: new Map(),
    tr,
    onOpenOrganizations: vi.fn(),
    onOpenPositions: vi.fn(),
    onOpenRoles: vi.fn(),
    onToggleStatus: vi.fn(),
    onResetPassword,
    onRemove: vi.fn(),
  })
  const render = columns.find((column) => column.valueType === 'option')?.render as
    | ((_: unknown, record: AccountRecord) => { props: { children: unknown[] } })
    | undefined
  const actions = render?.(undefined, target).props.children ?? []
  const button = actions.find(
    (item): item is { props: { children: string; onClick: () => void } } =>
      typeof item === 'object' &&
      item !== null &&
      'props' in item &&
      (item as { props: { children?: unknown } }).props.children === '重置密码',
  )
  return { button, onResetPassword }
}

describe('平台账号重置密码行操作', () => {
  it('平台管理员可对其他账号操作，包括锁定账号', () => {
    const action = resetAction({ currentUserId: 'admin', canResetPassword: true })
    expect(action.button).toBeDefined()
    action.button?.props.onClick()
    expect(action.onResetPassword).toHaveBeenCalledWith(target)
  })

  it('不展示本人重置入口，也不展示无权限入口', () => {
    expect(resetAction({ currentUserId: 'target', canResetPassword: true }).button).toBeUndefined()
    expect(resetAction({ currentUserId: 'admin', canResetPassword: false }).button).toBeUndefined()
  })
})
