import type { ActionType } from '@ant-design/pro-components'
import { App, Card } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  OrganizationMemberCandidate,
  OrganizationScope,
  OrganizationUnitNode,
  OrganizationUnitRecord,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { useLatestDialogRequest } from '@/hooks/useLatestDialogRequest'
import { useAccess, useManagementAction } from '@/pages/access/use-access'
import { organizationApi } from './api'
import OrganizationMembersDialog, {
  type OrganizationMembersDialogRef,
} from './components/OrganizationMembersDialog'
import OrganizationUnitDialog, {
  type OrganizationUnitDialogRef,
} from './components/OrganizationUnitDialog'
import MoveOrganizationUnitDialog, {
  type MoveOrganizationUnitDialogRef,
} from './components/MoveOrganizationUnitDialog'
import {
  createOrganizationMemberColumns,
  findTreeNode,
  loadOrganizationMemberDialogData,
  loadOrganizationMoveOptions,
  OrganizationMemberHeader,
  OrganizationTreePanel,
  replaceChildren,
  toTreeNodes,
  type BrowserSelection,
  type OrganizationTreeNode,
} from './components/OrganizationBrowser'

/** 管理企业或项目独立组织树，并按组织或未归属视图浏览成员。 */
export default function OrganizationPage() {
  const access = useAccess()
  const scope = access.scope as OrganizationScope
  const scopeKey = accessScopeKey(scope)
  const api = useMemo(() => organizationApi(scope), [scopeKey])
  const execute = useManagementAction()
  const { message } = App.useApp()
  const { tr } = useI18n()
  const [treeData, setTreeData] = useState<OrganizationTreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(true)
  const [selection, setSelection] = useState<BrowserSelection>('all')
  const tableRef = useRef<ActionType>(null)
  const unitRef = useRef<OrganizationUnitDialogRef>(null)
  const moveRef = useRef<MoveOrganizationUnitDialogRef>(null)
  const membersRef = useRef<OrganizationMembersDialogRef>(null)
  const membersRequest = useLatestDialogRequest(scopeKey)
  const moveRequest = useLatestDialogRequest(scopeKey)
  const prefix = `${scope.type}.organization`
  const allowed = (operation: string) => access.permissionKeys.includes(`${prefix}.${operation}`)
  const selectedNode =
    selection === 'all' || selection === 'unassigned'
      ? undefined
      : findTreeNode(treeData, selection)
  const selectedUnit = selectedNode?.unit

  /** 清空当前作用域树缓存并重新加载根节点。 */
  const reloadTree = useCallback(async () => {
    setTreeLoading(true)
    setSelection('all')
    try {
      const result = await api.tree()
      setTreeData(toTreeNodes(result.units, tr('停用')))
    } catch (error) {
      if ((error as Error).name !== 'AbortError')
        void message.error(error instanceof Error ? error.message : tr('无法加载组织架构'))
    } finally {
      setTreeLoading(false)
    }
  }, [api, message, tr])

  useEffect(() => {
    void reloadTree()
  }, [reloadTree])

  /** 在结构变更后同时刷新树根和当前成员表。 */
  const refreshAll = () => {
    void reloadTree()
    void tableRef.current?.reload()
  }

  /** 展开节点时仅请求其直接子级。 */
  async function loadNodeChildren(node: OrganizationTreeNode) {
    if (node.children || node.isLeaf) return
    try {
      const result = await api.tree({ parentId: node.unit.id })
      setTreeData((current) =>
        replaceChildren(current, node.unit.id, toTreeNodes(result.units, tr('停用'))),
      )
    } catch (error) {
      if ((error as Error).name !== 'AbortError')
        void message.error(error instanceof Error ? error.message : tr('无法加载下级组织'))
      throw error
    }
  }

  /** 加载当前组织单元的完整成员集合并打开职责编辑弹窗。 */
  async function openMembers(unit: OrganizationUnitNode) {
    await membersRequest.run({
      targetId: unit.id,
      load: () =>
        loadOrganizationMemberDialogData({
          api,
          scope,
          permissionKeys: access.permissionKeys,
          unitId: unit.id,
        }),
      onSuccess: (data) => membersRef.current?.show(unit, data.selected, data.filters),
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载组织成员'))
      },
    })
  }

  /** 加载完整树并打开移动弹窗。 */
  async function openMove(unit: OrganizationUnitRecord) {
    await moveRequest.run({
      targetId: unit.id,
      load: () => loadOrganizationMoveOptions(api, unit.id),
      onSuccess: (options) => moveRef.current?.show(unit, options),
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载可选父级'))
      },
    })
  }

  const columns = createOrganizationMemberColumns(selectedUnit, tr)

  return (
    <div className="h-full min-h-0 p-[16px] flex gap-[16px]">
      <OrganizationTreePanel
        scopeType={scope.type}
        treeData={treeData}
        loading={treeLoading}
        selection={selection}
        selectedUnit={selectedUnit}
        onReload={() => void reloadTree()}
        onSelect={setSelection}
        onLoadData={loadNodeChildren}
      />

      <Card
        className="h-full min-w-0 flex-1 overflow-hidden"
        styles={{ body: { height: '100%', padding: 0 } }}
      >
        <OrganizationMemberHeader
          selection={selection}
          selectedUnit={selectedUnit}
          canCreate={allowed('create')}
          canUpdate={allowed('update')}
          canMove={allowed('move')}
          canAssign={allowed('assign')}
          moving={moveRequest.loadingId === selectedUnit?.id}
          assigning={membersRequest.loadingId === selectedUnit?.id}
          onCreate={(parentId) => unitRef.current?.show(undefined, parentId)}
          onEdit={(unit) => unitRef.current?.show(unit)}
          onMove={(unit) => void openMove(unit)}
          onAssign={(unit) => void openMembers(unit)}
          onToggleStatus={(unit) =>
            execute(
              () =>
                api.updateUnitStatus(unit.id, {
                  status: unit.status === 'active' ? 'disabled' : 'active',
                  expectedVersion: unit.version,
                }),
              refreshAll,
            )
          }
        />
        <div style={{ height: 'calc(100% - 64px)', minHeight: 0 }}>
          <FullHeightProTable<OrganizationMemberCandidate>
            actionRef={tableRef}
            rowKey="userId"
            columns={columns}
            headerTitle={false}
            search={{ labelWidth: 'auto' }}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
            }}
            request={
              /** 按当前树选择查询全部、未归属或单组织成员。 */ async (params) => {
                const result = await api.memberCandidates({
                  purpose: 'browseOrganization',
                  page: params.current,
                  pageSize: params.pageSize,
                  query: params.query as string | undefined,
                  ...(selectedUnit ? { organizationUnitIds: [selectedUnit.id] } : {}),
                  ...(selection === 'unassigned' ? { unassigned: true } : {}),
                })
                return { data: result.items, total: result.total, success: true }
              }
            }
            params={{ selection }}
            onRequestError={(error) => {
              if (error.name !== 'AbortError') void message.error(error.message)
            }}
          />
        </div>
      </Card>

      <OrganizationUnitDialog
        ref={unitRef}
        onSave={(values, record) =>
          execute(
            () =>
              record
                ? api.updateUnit(record.id, {
                    name: values.name,
                    code: values.code,
                    description: values.description,
                    sort: values.sort,
                    expectedVersion: record.version,
                  })
                : api.createUnit(values),
            refreshAll,
          )
        }
      />
      <MoveOrganizationUnitDialog
        ref={moveRef}
        onSave={(record, values) => execute(() => api.moveUnit(record.id, values), refreshAll)}
      />
      <OrganizationMembersDialog
        ref={membersRef}
        scope={scope}
        request={async (input) => {
          const { signal, ...params } = input
          const result = await api.memberCandidates(
            { ...params, purpose: 'browseOrganization' },
            signal,
          )
          return { items: result.items, total: result.total }
        }}
        resolve={(userIds) =>
          api.resolveMemberCandidates({ userIds, purpose: 'browseOrganization' })
        }
        onSave={(unit, members) =>
          execute(
            () => api.replaceUnitMembers(unit.id, { members }),
            () => {
              void tableRef.current?.reload()
            },
          )
        }
      />
    </div>
  )
}
