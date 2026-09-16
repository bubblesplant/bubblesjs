import { PlusOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { App, Button, Popconfirm, Space, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CreateOrganizationTemplateRequest,
  EntityStatus,
  OrganizationTemplateRecord,
  OrganizationTemplateSummary,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { useLatestDialogRequest } from '@/hooks/useLatestDialogRequest'
import { useAccess, useManagementAction } from '@/pages/access/use-access'
import { organizationTemplatesApi } from './api'
import OrganizationTemplateDialog, {
  type OrganizationTemplateDialogRef,
} from './components/OrganizationTemplateDialog'

/** 管理企业可用于新项目初始化的组织与岗位模板。 */
export default function OrganizationTemplatesPage() {
  const access = useAccess()
  if (access.scope.type !== 'company') throw new Error('组织模板页仅支持企业作用域')
  const api = organizationTemplatesApi(access.scope.companyId)
  const execute = useManagementAction()
  const { message } = App.useApp()
  const { tr } = useI18n()
  const actionRef = useRef<ActionType>(null)
  const dialogRef = useRef<OrganizationTemplateDialogRef>(null)
  const editRequest = useLatestDialogRequest(accessScopeKey(access.scope))
  const prefix = 'company.organization.templates'
  const allowed = (operation: string) => access.permissionKeys.includes(`${prefix}.${operation}`)
  /** 刷新模板摘要列表。 */
  const refresh = () => void actionRef.current?.reload()

  /** 获取当前完整定义后打开模板编辑器。 */
  async function openEdit(record: OrganizationTemplateSummary) {
    await editRequest.run({
      targetId: record.id,
      load: () => api.detail(record.id),
      onSuccess: (detail) => dialogRef.current?.show(detail),
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载模板详情'))
      },
    })
  }

  const columns: ProColumns<OrganizationTemplateSummary>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索模板名称') },
    },
    { title: tr('模板名称'), dataIndex: 'name', search: false, width: 200 },
    {
      title: tr('状态'),
      dataIndex: 'status',
      width: 100,
      valueEnum: {
        active: { text: tr('启用'), status: 'Success' },
        disabled: { text: tr('停用'), status: 'Default' },
      },
    },
    {
      title: tr('默认模板'),
      dataIndex: 'isDefault',
      search: false,
      width: 110,
      render: (_, record) =>
        record.isDefault ? <Tag color="purple">{tr('默认')}</Tag> : <span>—</span>,
    },
    { title: tr('组织单元'), dataIndex: 'unitCount', search: false, width: 100 },
    { title: tr('岗位'), dataIndex: 'positionCount', search: false, width: 90 },
    { title: tr('版本'), dataIndex: 'version', search: false, width: 80 },
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
      width: 280,
      render: (_, record) => (
        <Space size={4} wrap>
          {allowed('update') && (
            <Button
              type="link"
              size="small"
              loading={editRequest.loadingId === record.id}
              onClick={() => void openEdit(record)}
            >
              {tr('编辑定义')}
            </Button>
          )}
          {allowed('update') && record.status === 'active' && !record.isDefault && (
            <Popconfirm
              title={tr('设为默认模板？')}
              description={tr('企业现有默认模板会自动取消默认。')}
              onConfirm={() =>
                execute(
                  () =>
                    api.updateStatus(record.id, {
                      isDefault: true,
                      expectedVersion: record.version,
                    }),
                  refresh,
                )
              }
            >
              <Button type="link" size="small">
                {tr('设为默认')}
              </Button>
            </Popconfirm>
          )}
          {allowed('update') && (
            <Popconfirm
              title={record.status === 'active' ? tr('停用模板？') : tr('恢复模板？')}
              description={tr('停用模板不能用于新项目，历史项目不受影响。')}
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
      <FullHeightProTable<OrganizationTemplateSummary>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        headerTitle={tr('项目组织模板')}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        request={
          /** 查询模板摘要分页，不在列表阶段加载完整定义。 */ async (params) => {
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
                  onClick={() => dialogRef.current?.show()}
                >
                  {tr('创建模板')}
                </Button>,
              ]
            : []
        }
      />
      <OrganizationTemplateDialog
        ref={dialogRef}
        onSave={(values: CreateOrganizationTemplateRequest, record?: OrganizationTemplateRecord) =>
          execute(
            () =>
              record
                ? api.replace(record.id, {
                    ...values,
                    isDefault: values.isDefault ?? false,
                    expectedVersion: record.version,
                  })
                : api.create(values),
            refresh,
          )
        }
      />
    </>
  )
}
