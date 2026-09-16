import { PlusOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { App, Button, Popconfirm, Space, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { RoleRecord } from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { useLatestDialogRequest } from '@/hooks/useLatestDialogRequest'
import { managementApi } from './api'
import RoleFormDialog, { type RoleFormDialogRef } from './components/RoleFormDialog'
import RolePermissionsDialog, {
  type RolePermissionsDialogRef,
} from './components/RolePermissionsDialog'
import { useAccess, useManagementAction } from './use-access'

/** 管理当前作用域的角色，并按授权范围开放角色和权限编辑。 */
export default function RolesPage() {
  const access = useAccess()
  const api = managementApi(access.scope)
  const execute = useManagementAction()
  const { message } = App.useApp()
  const actionRef = useRef<ActionType>(null)
  const formRef = useRef<RoleFormDialogRef>(null)
  const permissionsRef = useRef<RolePermissionsDialogRef>(null)
  const permissionsRequest = useLatestDialogRequest(accessScopeKey(access.scope))
  const { tr } = useI18n()
  const allowed = (operation: string) =>
    access.permissionKeys.includes(`${access.scope.type}.roles.${operation}`)
  /** 重新查询当前表格，使管理操作立即反映到列表。 */
  const refresh = () => {
    void actionRef.current?.reload()
  }

  /** 同时读取角色详情和权限目录，按编辑权限打开配置弹窗。 */
  async function openPermissions(record: RoleRecord) {
    await permissionsRequest.run({
      targetId: record.id,
      load: () => Promise.all([api.role(record.id), api.permissions()]),
      onSuccess: ([latest, tree]) => {
        permissionsRef.current?.show(
          latest,
          tree,
          Boolean(latest.builtin) || !allowed('permissions'),
        )
      },
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载权限'))
      },
    })
  }

  const columns: ProColumns<RoleRecord>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索角色名称') },
    },
    { title: tr('角色名称'), dataIndex: 'name', search: false, width: 180 },
    {
      title: tr('类型'),
      search: false,
      width: 120,
      render: (_, record) => (
        <Tag color={record.builtin ? 'blue' : 'default'}>
          {record.builtin ? tr('内置角色') : tr('自定义角色')}
        </Tag>
      ),
    },
    { title: tr('说明'), dataIndex: 'description', search: false, ellipsis: true },
    { title: tr('已分配人数'), dataIndex: 'memberCount', search: false, width: 120 },
    {
      title: tr('权限数量'),
      search: false,
      width: 100,
      render: (_, record) => record.permissionKeys.length,
    },
    {
      title: tr('操作'),
      valueType: 'option',
      width: 270,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            loading={permissionsRequest.loadingId === record.id}
            onClick={() => void openPermissions(record)}
          >
            {record.builtin || !allowed('permissions') ? tr('查看权限') : tr('配置权限')}
          </Button>
          {!record.builtin && allowed('update') && (
            <Button type="link" size="small" onClick={() => formRef.current?.show(record)}>
              {tr('编辑')}
            </Button>
          )}
          {!record.builtin && allowed('delete') && (
            <Popconfirm
              title={tr('删除角色？')}
              description={tr('只能删除未分配给任何成员的自定义角色。')}
              onConfirm={() => execute(() => api.deleteRole(record.id, record.version), refresh)}
            >
              <Button type="link" size="small" danger disabled={record.memberCount > 0}>
                {tr('删除')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]
  return (
    <>
      <FullHeightProTable<RoleRecord>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        headerTitle={tr('角色管理')}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        request={
          /** 查询当前作用域角色，并转换为表格分页结果。 */ async (params) => {
            const result = await api.roles({
              page: params.current,
              pageSize: params.pageSize,
              query: params.query as string | undefined,
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
                  key="add"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => formRef.current?.show()}
                >
                  {tr('创建角色')}
                </Button>,
              ]
            : []
        }
      />
      <RoleFormDialog
        ref={formRef}
        onSave={(values, record) =>
          execute(
            () =>
              record
                ? api.updateRole(record.id, { ...values, expectedVersion: record.version })
                : api.createRole(values),
            refresh,
          )
        }
      />
      <RolePermissionsDialog
        ref={permissionsRef}
        onSave={(record, permissionKeys) =>
          execute(
            () =>
              api.rolePermissions(record.id, { permissionKeys, expectedVersion: record.version }),
            refresh,
          )
        }
      />
    </>
  )
}
