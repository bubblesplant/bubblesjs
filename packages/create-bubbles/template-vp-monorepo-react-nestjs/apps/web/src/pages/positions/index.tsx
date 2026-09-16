import { PlusOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { App, Button, Popconfirm, Space, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { EntityStatus, OrganizationScope, PositionRecord } from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { useLatestDialogRequest } from '@/hooks/useLatestDialogRequest'
import { useAccess, useManagementAction } from '@/pages/access/use-access'
import { positionsApi } from './api'
import PositionFormDialog, { type PositionFormDialogRef } from './components/PositionFormDialog'
import PositionMembersDialog, {
  type PositionMembersDialogRef,
} from './components/PositionMembersDialog'
import { loadAllPositions, loadPositionMembers } from './loaders'

/** 管理企业或项目的独立岗位列表及岗位任职成员。 */
export default function PositionsPage() {
  const access = useAccess()
  const scope = access.scope as OrganizationScope
  const api = positionsApi(scope)
  const execute = useManagementAction()
  const { message } = App.useApp()
  const { tr } = useI18n()
  const actionRef = useRef<ActionType>(null)
  const formRef = useRef<PositionFormDialogRef>(null)
  const membersRef = useRef<PositionMembersDialogRef>(null)
  const membersRequest = useLatestDialogRequest(accessScopeKey(scope))
  const prefix = `${scope.type}.positions`
  const allowed = (operation: string) => access.permissionKeys.includes(`${prefix}.${operation}`)
  /** 重新加载岗位表格。 */
  const refresh = () => void actionRef.current?.reload()

  /** 查询当前岗位的完整成员集合后打开分配弹窗。 */
  async function openMembers(record: PositionRecord) {
    await membersRequest.run({
      targetId: record.id,
      load: () => Promise.all([loadPositionMembers(api, record.id), loadAllPositions(api)]),
      onSuccess: ([selected, positions]) => {
        membersRef.current?.show(record, selected, {
          positions: positions.map((position) => ({ value: position.id, label: position.name })),
        })
      },
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载岗位成员'))
      },
    })
  }

  const columns: ProColumns<PositionRecord>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索岗位名称或编码') },
    },
    { title: tr('岗位名称'), dataIndex: 'name', search: false, width: 180 },
    { title: tr('编码'), dataIndex: 'code', search: false, width: 150 },
    {
      title: tr('状态'),
      dataIndex: 'status',
      width: 100,
      valueEnum: {
        active: { text: tr('启用'), status: 'Success' },
        disabled: { text: tr('停用'), status: 'Default' },
      },
    },
    { title: tr('任职人数'), dataIndex: 'memberCount', search: false, width: 110 },
    { title: tr('说明'), dataIndex: 'description', search: false, ellipsis: true },
    {
      title: tr('更新时间'),
      dataIndex: 'updatedAt',
      valueType: 'dateTime',
      search: false,
      width: 180,
    },
    {
      title: tr('操作'),
      valueType: 'option',
      width: 260,
      render: (_, record) => (
        <Space size={4} wrap>
          {allowed('assign') && (
            <Button
              type="link"
              size="small"
              loading={membersRequest.loadingId === record.id}
              onClick={() => void openMembers(record)}
            >
              {tr('分配成员')}
            </Button>
          )}
          {allowed('update') && (
            <Button type="link" size="small" onClick={() => formRef.current?.show(record)}>
              {tr('编辑')}
            </Button>
          )}
          {allowed('update') && (
            <Popconfirm
              title={record.status === 'active' ? tr('停用岗位？') : tr('恢复岗位？')}
              description={tr('状态变化不会删除既有任职关系。')}
              onConfirm={() =>
                execute(
                  () =>
                    api.updateStatus(record.id, {
                      status: record.status === 'active' ? 'disabled' : 'active',
                      expectedVersion: record.version,
                    }),
                  refresh,
                )
              }
            >
              <Button type="link" size="small" danger={record.status === 'active'}>
                {record.status === 'active' ? tr('停用') : tr('恢复')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <FullHeightProTable<PositionRecord>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        headerTitle={
          <Space>
            <span>{tr('岗位管理')}</span>
            <Tag color="purple">{scope.type === 'company' ? tr('企业级') : tr('项目级')}</Tag>
          </Space>
        }
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        request={
          /** 查询岗位分页并转换为 ProTable 结果。 */ async (params) => {
            const result = await api.list({
              page: params.current,
              pageSize: params.pageSize,
              query: params.query as string | undefined,
              status: params.status as EntityStatus | undefined,
            })
            return { data: result.items, total: result.total, success: true }
          }
        }
        onRequestError={(error) => {
          if (error.name !== 'AbortError') void message.error(error.message)
        }}
        toolBarRender={() =>
          allowed('create')
            ? [
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => formRef.current?.show()}
                >
                  {tr('创建岗位')}
                </Button>,
              ]
            : []
        }
      />
      <PositionFormDialog
        ref={formRef}
        onSave={(values, record) =>
          execute(
            () =>
              record
                ? api.update(record.id, { ...values, expectedVersion: record.version })
                : api.create(values),
            refresh,
          )
        }
      />
      <PositionMembersDialog
        ref={membersRef}
        scope={scope}
        request={async (input) => {
          const { signal, ...params } = input
          const result = await api.memberCandidates(
            { ...params, purpose: 'assignPositionMembers' },
            signal,
          )
          return { items: result.items, total: result.total }
        }}
        resolve={(userIds) =>
          api.resolveMemberCandidates({ userIds, purpose: 'assignPositionMembers' })
        }
        onSave={(record, userIds) =>
          execute(() => api.replacePositionMembers(record.id, { userIds }), refresh)
        }
      />
    </>
  )
}
