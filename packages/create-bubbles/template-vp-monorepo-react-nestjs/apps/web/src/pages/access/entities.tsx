import { PlusOutlined } from '@ant-design/icons'
import type { ActionType, ProColumns } from '@ant-design/pro-components'
import { App, Button, Empty, Popconfirm, Space } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CompanyRecord,
  CreateCompanyRequest,
  CreateProjectRequest,
  EntityStatus,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { useLatestDialogRequest } from '@/hooks/useLatestDialogRequest'
import { managementApi } from './api'
import AdministratorDialog, { type AdministratorDialogRef } from './components/AdministratorDialog'
import CompanyHierarchyDialog, {
  type CompanyHierarchyDialogRef,
} from './components/CompanyHierarchyDialog'
import EntityFormDialog, { type EntityFormDialogRef } from './components/EntityFormDialog'
import {
  createGlobalAccountResolver,
  createGlobalAccountSearch,
  createOrganizationMemberResolver,
  createOrganizationMemberSearch,
} from './components/EntitySelectors'
import { useAccess, useManagementAction } from './use-access'

/** 按当前作用域管理下级企业或项目，并提供状态及管理员维护入口。 */
export default function EntitiesPage() {
  const access = useAccess()
  const project = access.scope.type === 'company'
  const memberContextKey = accessScopeKey(access.scope)
  const api = managementApi(access.scope)
  const actionRef = useRef<ActionType>(null)
  const formRef = useRef<EntityFormDialogRef>(null)
  const administratorRef = useRef<AdministratorDialogRef>(null)
  const hierarchyRef = useRef<CompanyHierarchyDialogRef>(null)
  const administratorRequest = useLatestDialogRequest(accessScopeKey(access.scope))
  const { message } = App.useApp()
  const execute = useManagementAction()
  const { tr } = useI18n()
  const prefix = project ? 'company.projects' : 'platform.companies'
  const allowed = (action: string) => access.permissionKeys.includes(`${prefix}.${action}`)
  const canCreate = allowed('create') && access.administrator === (project ? 'company' : 'platform')
  /** 重新查询当前表格，使管理操作立即反映到列表。 */
  const refresh = () => {
    void actionRef.current?.reload()
  }

  /** 获取实体当前管理员信息后打开管理员维护弹窗。 */
  async function openAdministrator(record: CompanyRecord) {
    await administratorRequest.run({
      targetId: record.id,
      load: async () =>
        project
          ? api.projectAdministrators(record.id)
          : (await api.companyDetail(record.id)).administrators,
      onSuccess: (administrators) => administratorRef.current?.show(record, administrators),
      onError: (error) => {
        if ((error as Error).name !== 'AbortError')
          void message.error(error instanceof Error ? error.message : tr('无法加载管理员，请重试'))
      },
    })
  }

  const columns: ProColumns<CompanyRecord>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: {
        placeholder: tr('搜索{type}名称或编码', { type: project ? tr('项目') : tr('企业') }),
      },
    },
    {
      title: project ? tr('项目名称') : tr('企业名称'),
      dataIndex: 'name',
      search: false,
      ellipsis: true,
      width: 220,
    },
    { title: tr('编码'), dataIndex: 'code', search: false, width: 150 },
    {
      title: tr('状态'),
      dataIndex: 'status',
      valueEnum: {
        active: { text: tr('启用'), status: 'Success' },
        disabled: { text: tr('停用'), status: 'Default' },
      },
      width: 100,
    },
    { title: tr('说明'), dataIndex: 'description', search: false, ellipsis: true },
    {
      title: tr('创建时间'),
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      search: false,
      width: 180,
    },
    {
      title: tr('操作'),
      valueType: 'option',
      width: 270,
      render: (_, record) => (
        <Space size={4} wrap>
          {project && record.status === 'active' && access.scope.type === 'company' && (
            <Link to={`/companies/${access.scope.companyId}/projects/${record.id}`}>
              {tr('进入项目')}
            </Link>
          )}
          {allowed('administrator') && (
            <Button
              type="link"
              size="small"
              loading={administratorRequest.loadingId === record.id}
              onClick={() => void openAdministrator(record)}
            >
              {tr('设置管理员')}
            </Button>
          )}
          {allowed('status') && (
            <Popconfirm
              title={
                record.status === 'active'
                  ? tr('停用{type}？', { type: project ? tr('项目') : tr('企业') })
                  : tr('启用{type}？', { type: project ? tr('项目') : tr('企业') })
              }
              description={
                record.status === 'active'
                  ? tr('停用后阻断访问，保留成员和角色。')
                  : tr('恢复时检查有效管理员，保留子级原有状态。')
              }
              onConfirm={() =>
                execute(
                  () =>
                    api.entityStatus(record.id, {
                      status: record.status === 'active' ? 'disabled' : 'active',
                      expectedVersion: record.version,
                    }),
                  refresh,
                )
              }
            >
              <Button type="link" size="small" danger={record.status === 'active'}>
                {record.status === 'active' ? tr('停用') : tr('启用')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <FullHeightProTable<CompanyRecord>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        headerTitle={project ? tr('项目管理') : tr('企业管理')}
        locale={{
          emptyText: (
            <Empty
              className="workspace-table-empty"
              image={<span className="workspace-empty-orbit" aria-hidden="true" />}
              description={
                <>
                  <strong>{tr('暂无{type}', { type: project ? tr('项目') : tr('企业') })}</strong>
                  <p>
                    {tr('试试调整搜索条件')}
                    {canCreate
                      ? tr('，或{action}', {
                          action: project ? tr('创建项目') : tr('开通企业'),
                        })
                      : ''}
                    {tr('。')}
                  </p>
                </>
              }
            />
          ),
        }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        request={
          /** 按作用域查询企业或项目列表，并转换为表格分页结果。 */ async (params) => {
            const query = {
              page: params.current ?? 1,
              pageSize: params.pageSize ?? 20,
              query: params.query as string | undefined,
              status: params.status as EntityStatus | undefined,
            }
            const result = project ? await api.projects(query) : await api.companies(query)
            return { data: result.items, total: result.total, success: true }
          }
        }
        onRequestError={(error) => {
          if (error.name !== 'AbortError') void message.error(error.message)
        }}
        toolBarRender={() => [
          ...(!project && allowed('hierarchy')
            ? [
                <Button key="hierarchy" onClick={() => hierarchyRef.current?.show()}>
                  {tr('企业层级')}
                </Button>,
              ]
            : []),
          ...(canCreate
            ? [
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => formRef.current?.show()}
                >
                  {project ? tr('创建项目') : tr('开通企业')}
                </Button>,
              ]
            : []),
        ]}
      />
      <EntityFormDialog
        ref={formRef}
        project={project}
        memberContextKey={memberContextKey}
        globalAccountRequest={createGlobalAccountSearch(api, 'createCompanyAdministrator')}
        resolveGlobalAccounts={createGlobalAccountResolver(api, 'createCompanyAdministrator')}
        memberRequest={createOrganizationMemberSearch(api, 'createProjectAdministrator')}
        resolveMembers={createOrganizationMemberResolver(api, 'createProjectAdministrator')}
        loadCompanyTree={!project ? api.companyTree : undefined}
        loadTemplates={
          project && access.permissionKeys.includes('company.organization.templates.read')
            ? async () =>
                (await api.organizationTemplates({ page: 1, pageSize: 100, status: 'active' }))
                  .items
            : undefined
        }
        onSave={(values) =>
          execute(
            () =>
              project
                ? api.createProject(values as CreateProjectRequest)
                : api.createCompany(values as CreateCompanyRequest),
            refresh,
          )
        }
      />
      <AdministratorDialog
        ref={administratorRef}
        project={project}
        memberContextKey={memberContextKey}
        globalAccountRequest={createGlobalAccountSearch(api, 'setCompanyAdministrator')}
        resolveGlobalAccounts={createGlobalAccountResolver(api, 'setCompanyAdministrator')}
        memberRequest={createOrganizationMemberSearch(api, 'setProjectAdministrator')}
        resolveMembers={createOrganizationMemberResolver(api, 'setProjectAdministrator')}
        onSave={(record, input) => execute(() => api.setAdministrator(record.id, input), refresh)}
      />
      {!project && (
        <CompanyHierarchyDialog
          ref={hierarchyRef}
          loadTree={api.companyTree}
          onSave={(record, values) =>
            execute(() => api.updateCompanyHierarchy(record.id, values), refresh)
          }
        />
      )}
    </>
  )
}
