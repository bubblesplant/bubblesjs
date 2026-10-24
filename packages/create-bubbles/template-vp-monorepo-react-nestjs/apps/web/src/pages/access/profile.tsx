import { ProForm, ProFormText, ProFormTextArea } from '@ant-design/pro-components'
import { Alert, Button, Card, Descriptions, Space, Spin, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CompanyDetail, ProjectDetail, UpdateProfileRequest } from 'shared/types'
import { getRequestErrorMessage, accessScopeKey } from 'shared/utils'
import { managementApi } from './api'
import { useAccess, useManagementAction } from './use-access'

/** 查看并按权限更新当前企业或项目资料。 */
export default function ProfilePage() {
  const access = useAccess()
  const scopeKey = accessScopeKey(access.scope)
  const [record, setRecord] = useState<CompanyDetail | ProjectDetail>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const execute = useManagementAction()
  const api = managementApi(access.scope)
  const canEdit = access.permissionKeys.includes(`${access.scope.type}.profile.update`)
  const { locale, tr } = useI18n()

  useEffect(
    /** 加载当前工作空间资料，避免过期请求覆盖最新页面状态。 */ () => {
      let active = true
      setLoading(true)
      setError(undefined)
      void api
        .profile()
        .then((value) => {
          if (active) setRecord(value)
        })
        .catch((cause: unknown) => {
          if (active && (cause as Error).name !== 'AbortError')
            setError(getRequestErrorMessage(cause, tr('无法加载资料')))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
      return () => {
        active = false
      }
    },
    [scopeKey, refresh],
  )

  return (
    <div className="workspace-page">
      <div className="workspace-page-title">
        <h1>{access.scope.type === 'company' ? tr('企业资料') : tr('项目资料')}</h1>
        <p>{tr('维护当前工作空间的名称、编码与说明。')}</p>
      </div>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button onClick={() => setRefresh((value) => value + 1)}>{tr('重试')}</Button>}
        />
      ) : loading ? (
        <Spin />
      ) : (
        record && (
          <Card style={{ maxWidth: 800 }}>
            <Descriptions
              column={2}
              style={{ marginBottom: 24 }}
              items={[
                {
                  key: 'status',
                  label: tr('当前状态'),
                  children: (
                    <Tag color={record.status === 'active' ? 'success' : 'default'}>
                      {record.status === 'active' ? tr('启用') : tr('停用')}
                    </Tag>
                  ),
                },
                {
                  key: 'created',
                  label: tr('创建时间'),
                  children: new Date(record.createdAt).toLocaleString(
                    locale === 'en_US' ? 'en-US' : 'zh-CN',
                  ),
                },
                {
                  key: 'administrators',
                  label: tr('管理员'),
                  span: 2,
                  children: (
                    <Space wrap>
                      {record.administrators.map((admin) => (
                        <Tag key={admin.id} color={admin.effective ? 'cyan' : 'default'}>
                          {admin.name} ({admin.account}){admin.effective ? '' : tr(' · 当前无效')}
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
            <ProForm<UpdateProfileRequest>
              key={`${record.id}:${record.version}`}
              initialValues={record}
              disabled={!canEdit}
              submitter={
                canEdit
                  ? { searchConfig: { submitText: tr('保存资料') }, resetButtonProps: false }
                  : false
              }
              onFinish={(values) =>
                execute(
                  /** 携带当前资料版本提交规范化修改，并合并服务端返回的最新资料。 */ async () => {
                    const latest = await api.updateProfile({
                      name: values.name?.trim(),
                      code: values.code?.trim().toLowerCase(),
                      description: values.description?.trim(),
                      expectedVersion: record.version,
                    })
                    setRecord({ ...record, ...latest })
                  },
                )
              }
            >
              <ProFormText
                name="name"
                label={tr('名称')}
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    min: 2,
                    max: 100,
                    message: tr('请输入 2–100 字名称'),
                  },
                ]}
                fieldProps={{ maxLength: 100 }}
              />
              <ProFormText
                name="code"
                label={tr('编码')}
                rules={[
                  {
                    required: true,
                    pattern: /^[A-Za-z0-9_-]{2,32}$/,
                    message: tr('请输入 2–32 位字母、数字、下划线或短横线'),
                  },
                ]}
                fieldProps={{ maxLength: 32 }}
              />
              <ProFormTextArea
                name="description"
                label={tr('说明')}
                fieldProps={{ rows: 4, maxLength: 500, showCount: true }}
              />
            </ProForm>
          </Card>
        )
      )}
    </div>
  )
}
