import { getRequestErrorMessage } from 'shared/utils'
import type { ProColumns } from '@ant-design/pro-components'
import type { I18nState } from '@bubblesjs/i18n-core'
import { useI18n } from '@bubblesjs/i18n-react'
import { App, Typography } from 'antd'
import type { AuditRecord } from 'shared/types'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { managementApi } from './api'
import { useAccess } from './use-access'

/** 使用当前语言构建审计操作名称。 */
function createActionNames(tr: I18nState['tr']): Record<string, string> {
  return {
    'company.create': tr('开通企业'),
    'company.status': tr('变更企业状态'),
    'company.administrator.set': tr('设置企业管理员'),
    'company.update': tr('修改企业资料'),
    'project.update': tr('修改项目资料'),
    'project.create': tr('创建项目'),
    'project.status': tr('变更项目状态'),
    'project.administrator.set': tr('设置项目管理员'),
    'account.status': tr('变更账号状态'),
    'account.roles': tr('分配平台角色'),
    'member.add': tr('添加成员'),
    'member.status': tr('变更成员状态'),
    'member.remove': tr('移除成员'),
    'member.roles': tr('分配成员角色'),
    'role.create': tr('创建角色'),
    'role.update': tr('修改角色'),
    'role.permissions': tr('修改角色权限'),
    'role.delete': tr('删除角色'),
    'menu.create': tr('新增菜单'),
    'menu.update': tr('修改菜单'),
    'menu.delete': tr('删除菜单'),
    'permission.cleanup': tr('清理废弃权限'),
  }
}

/** 使用当前语言构建审计摘要字段名称。 */
function createSummaryNames(tr: I18nState['tr']): Record<string, string> {
  return {
    changedFields: tr('修改字段'),
    fromStatus: tr('原状态'),
    toStatus: tr('新状态'),
    roleIds: tr('角色'),
    permissionKeys: tr('权限'),
    targetUserId: tr('目标用户'),
    companyId: tr('企业'),
    replacedUserId: tr('被替换用户'),
    name: tr('名称'),
    code: tr('编码'),
    description: tr('说明'),
  }
}

/** 按当前工作空间查询操作日志，展示操作者、目标对象及变更摘要。 */
export default function AuditPage() {
  const access = useAccess()
  const api = managementApi(access.scope)
  const { message } = App.useApp()
  const { tr } = useI18n()
  const actionNames = createActionNames(tr)
  const summaryNames = createSummaryNames(tr)
  const columns: ProColumns<AuditRecord>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('操作、对象类型或对象编号') },
    },
    {
      title: tr('操作'),
      dataIndex: 'action',
      width: 160,
      valueType: 'select',
      valueEnum: actionNames,
    },
    {
      title: tr('时间范围'),
      dataIndex: 'timeRange',
      valueType: 'dateTimeRange',
      hideInTable: true,
      search: {
        /** 将审计查询时间范围转换为接口要求的 ISO 起止时间。 */
        transform: (value: string[]) => ({
          from: value[0] ? new Date(value[0]).toISOString() : undefined,
          to: value[1] ? new Date(value[1]).toISOString() : undefined,
        }),
      },
    },
    {
      title: tr('操作时间'),
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      search: false,
      width: 180,
    },
    {
      title: tr('操作者'),
      search: false,
      width: 180,
      render: (_, record) => (
        <span>
          {record.actor.name}
          <br />
          <Typography.Text type="secondary">{record.actor.account}</Typography.Text>
        </span>
      ),
    },
    {
      title: tr('对象'),
      search: false,
      width: 220,
      render: (_, record) => (
        <span>
          {record.objectType}
          <br />
          <Typography.Text copyable>{record.objectId}</Typography.Text>
        </span>
      ),
    },
    {
      title: tr('变更摘要'),
      search: false,
      width: 320,
      render: (_, record) => (
        <div className="audit-summary">
          {Object.entries(record.summary).map(([key, value]) => (
            <div key={key}>
              <strong>{summaryNames[key] ?? key}: </strong>
              {Array.isArray(value) ? value.join(', ') : String(value ?? '—')}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: tr('请求编号'),
      dataIndex: 'requestId',
      search: false,
      copyable: true,
      ellipsis: true,
      width: 200,
    },
  ]
  return (
    <FullHeightProTable<AuditRecord>
      rowKey="id"
      columns={columns}
      headerTitle={tr('操作日志')}
      pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
      request={
        /** 转换表格查询条件为审计分页参数，并适配返回结果。 */ async (params) => {
          const result = await api.audits({
            page: params.current,
            pageSize: params.pageSize,
            query: params.query as string | undefined,
            action: params.action as string | undefined,
            from: params.from as string | undefined,
            to: params.to as string | undefined,
          })
          return { data: result.items, total: result.total, success: true }
        }
      }
      onRequestError={(error) => {
        if (error.name !== 'AbortError')
          void message.error(getRequestErrorMessage(error, error.message))
      }}
    />
  )
}
