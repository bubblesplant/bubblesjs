import { PlusOutlined } from '@ant-design/icons'
import type { ActionType } from '@ant-design/pro-components'
import { App, Button } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  AccountRecord,
  EntityStatus,
  MemberRecord,
  OrganizationMemberCandidate,
  OrganizationScope,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { useLatestDialogRequest } from '@/hooks/useLatestDialogRequest'
import { managementApi } from './api'
import AddMemberDialog, { type AddMemberDialogRef } from './components/AddMemberDialog'
import MemberRolesDialog, { type MemberRolesDialogRef } from './components/MemberRolesDialog'
import {
  MemberOrganizationsDialog,
  type MemberOrganizationsDialogRef,
  MemberPositionsDialog,
  type MemberPositionsDialogRef,
  loadAllOrganizationUnits,
  loadAllPositions,
} from './components/MemberAffiliations'
import { createMemberTableColumns, removeMemberCandidate } from './components/MemberTable'
import { useAccess, useManagementAction } from './use-access'
import { organizationApi } from '@/pages/organization/api'
import { positionsApi } from '@/pages/positions/api'

/** 按作用域管理账号或成员，处理状态、移除及角色分配。 */
export default function MembersPage() {
  const access = useAccess()
  const platform = access.scope.type === 'platform'
  const api = managementApi(access.scope)
  const execute = useManagementAction()
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>(null)
  const addRef = useRef<AddMemberDialogRef>(null)
  const rolesRef = useRef<MemberRolesDialogRef>(null)
  const organizationsRef = useRef<MemberOrganizationsDialogRef>(null)
  const positionsRef = useRef<MemberPositionsDialogRef>(null)
  const [candidateByUserId, setCandidateByUserId] = useState(
    () => new Map<string, OrganizationMemberCandidate>(),
  )
  const { tr } = useI18n()
  const prefix = `${access.scope.type}.${platform ? 'accounts' : 'members'}`
  const allowed = (action: string) => access.permissionKeys.includes(`${prefix}.${action}`)
  const organizationPrefix = `${access.scope.type}.organization`
  const positionsPrefix = `${access.scope.type}.positions`
  const canReadOrganization =
    !platform && access.permissionKeys.includes(`${organizationPrefix}.read`)
  const canAssignOrganization =
    !platform && access.permissionKeys.includes(`${organizationPrefix}.assign`)
  const canAssignPositions =
    !platform && access.permissionKeys.includes(`${positionsPrefix}.assign`)
  const scope = platform ? undefined : (access.scope as OrganizationScope)
  const scopeKey = accessScopeKey(access.scope)
  const rolesRequest = useLatestDialogRequest(scopeKey)
  const organizationsRequest = useLatestDialogRequest(scopeKey)
  const positionsRequest = useLatestDialogRequest(scopeKey)
  const organization = useMemo(() => (scope ? organizationApi(scope) : undefined), [scopeKey])
  const positions = useMemo(() => (scope ? positionsApi(scope) : undefined), [scopeKey])
  /** 重新查询当前表格，使管理操作立即反映到列表。 */
  const refresh = () => {
    void actionRef.current?.reload()
  }

  /** 加载可分配角色，并将当前成员或账号带入角色分配弹窗。 */
  async function openRoles(record: AccountRecord | MemberRecord) {
    await rolesRequest.run({
      targetId: record.id,
      load: async () => {
        const first = await api.roles({ page: 1, pageSize: 100 })
        const rest = await Promise.all(
          Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, index) =>
            api.roles({ page: index + 2, pageSize: 100 }),
          ),
        )
        return [...first.items, ...rest.flatMap((page) => page.items)]
      },
      onSuccess: (roles) => rolesRef.current?.show(record, roles),
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载角色'))
      },
    })
  }

  /** 通过组织浏览权限取得成员当前组织和岗位快照。 */
  async function resolveOrganizationCandidate(record: MemberRecord) {
    const cached = candidateByUserId.get(record.userId)
    if (cached) return cached
    if (!organization) throw new Error(tr('当前作用域不支持组织关系'))
    const [candidate] = await organization.resolveMemberCandidates({
      userIds: [record.userId],
      purpose: 'browseOrganization',
    })
    if (!candidate) throw new Error(tr('成员当前不可见'))
    return candidate
  }

  /** 通过岗位分配权限取得成员当前岗位快照，不依赖组织读取权限。 */
  async function resolvePositionCandidate(record: MemberRecord) {
    if (!positions) throw new Error(tr('当前作用域不支持岗位关系'))
    const [candidate] = await positions.resolveMemberCandidates({
      userIds: [record.userId],
      purpose: 'assignPositionMembers',
    })
    if (!candidate) throw new Error(tr('成员当前不可见'))
    return candidate
  }

  /** 加载组织候选和完整组织树后打开成员组织归属编辑器。 */
  async function openOrganizations(record: MemberRecord) {
    await organizationsRequest.run({
      targetId: record.id,
      load: () =>
        Promise.all([
          resolveOrganizationCandidate(record),
          organization ? loadAllOrganizationUnits(organization) : [],
        ]),
      onSuccess: ([candidate, units]) => {
        setCandidateByUserId((current) => new Map(current).set(candidate.userId, candidate))
        organizationsRef.current?.show(record, candidate, units)
      },
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载组织归属'))
      },
    })
  }

  /** 加载成员候选和完整岗位列表后打开岗位任职编辑器。 */
  async function openPositions(record: MemberRecord) {
    await positionsRequest.run({
      targetId: record.id,
      load: () =>
        Promise.all([
          resolvePositionCandidate(record),
          positions ? loadAllPositions(positions) : [],
        ]),
      onSuccess: ([candidate, availablePositions]) => {
        positionsRef.current?.show(record, candidate, availablePositions)
      },
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载岗位任职'))
      },
    })
  }

  const columns = createMemberTableColumns({
    platform,
    companyScope: access.scope.type === 'company',
    canReadOrganization,
    canAssignOrganization,
    canAssignPositions,
    canManageRoles: allowed('roles'),
    canManageStatus: allowed('status'),
    canRemove: allowed('remove'),
    candidateByUserId,
    openingOrganizationId: organizationsRequest.loadingId,
    openingPositionId: positionsRequest.loadingId,
    openingRoleId: rolesRequest.loadingId,
    tr,
    onOpenOrganizations: (record) => void openOrganizations(record),
    onOpenPositions: (record) => void openPositions(record),
    onOpenRoles: (record) => void openRoles(record),
    onToggleStatus: (record) => {
      void execute(
        () =>
          platform
            ? api.accountStatus(record.id, {
                status: record.status === 'active' ? 'disabled' : 'active',
              })
            : api.memberStatus(record.id, {
                status: record.status === 'active' ? 'disabled' : 'active',
                expectedVersion: (record as MemberRecord).version,
              }),
        refresh,
      )
    },
    onRemove: (record) => {
      void execute(() => api.removeMember(record.id, record.version), refresh)
    },
  })
  return (
    <>
      <FullHeightProTable<MemberRecord | AccountRecord>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        headerTitle={
          platform
            ? tr('全局账号')
            : access.scope.type === 'company'
              ? tr('企业成员')
              : tr('项目成员')
        }
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        request={
          /** 按作用域查询全局账号或空间成员，并转换为表格分页结果。 */ async (params) => {
            const query = {
              page: params.current ?? 1,
              pageSize: params.pageSize ?? 20,
              query: params.query as string | undefined,
              status: params.status as EntityStatus | undefined,
            }
            const result = platform ? await api.accounts(query) : await api.members(query)
            if (!platform && canReadOrganization && result.items.length && organization) {
              try {
                const candidates = await organization.resolveMemberCandidates({
                  userIds: result.items.map((item) => (item as MemberRecord).userId),
                  purpose: 'browseOrganization',
                })
                setCandidateByUserId(
                  new Map(candidates.map((candidate) => [candidate.userId, candidate])),
                )
              } catch (error) {
                if ((error as Error).name !== 'AbortError') throw error
              }
            } else if (!platform) {
              setCandidateByUserId(new Map())
            }
            return { data: result.items, total: result.total, success: true }
          }
        }
        onRequestError={(error) => {
          if (error.name !== 'AbortError') void message.error(error.message)
        }}
        toolBarRender={() =>
          !platform && allowed('add')
            ? [
                <Button
                  key="add"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => addRef.current?.show()}
                >
                  {tr('添加成员')}
                </Button>,
              ]
            : []
        }
      />
      <AddMemberDialog
        ref={addRef}
        project={access.scope.type === 'project'}
        onSave={(data) => execute(() => api.addMember(data), refresh)}
      />
      <MemberRolesDialog
        ref={rolesRef}
        onSave={(record, roleIds) =>
          execute(
            () =>
              platform
                ? api.accountRoles(record.id, { roleIds })
                : api.memberRoles(record.id, {
                    roleIds,
                    expectedVersion: (record as MemberRecord).version,
                  }),
            refresh,
          )
        }
      />
      {scope && organization && positions && (
        <>
          <MemberOrganizationsDialog
            ref={organizationsRef}
            scope={scope}
            onSave={(record, relations) =>
              execute(
                () => organization.replaceMemberUnits(record.userId, { relations }),
                () => {
                  setCandidateByUserId((current) => removeMemberCandidate(current, record.userId))
                  refresh()
                },
              )
            }
          />
          <MemberPositionsDialog
            ref={positionsRef}
            scope={scope}
            onSave={(record, positionIds) =>
              execute(
                () => positions.replaceMemberPositions(record.userId, { positionIds }),
                () => {
                  setCandidateByUserId((current) => removeMemberCandidate(current, record.userId))
                  refresh()
                },
              )
            }
          />
        </>
      )}
    </>
  )
}
