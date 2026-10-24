import { getRequestErrorMessage } from 'shared/utils'
import {
  ModalForm,
  ProFormDependency,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components'
import { Alert, App, Form } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CreateCompanyRequest,
  CreateProjectRequest,
  OrganizationMemberCandidate,
  OrganizationTemplateSummary,
} from 'shared/types'
import GlobalAccountSelect from '@/components/Selector/GlobalAccountSelect'
import type {
  GlobalAccountResolver,
  GlobalAccountSearchRequest,
  GlobalAccountSearchResult,
} from '@/components/Selector/GlobalAccountSelect'
import OrganizationMemberSelector from '@/components/Selector/OrganizationMemberSelector'
import type {
  OrganizationMemberSearchRequest,
  OrganizationMemberSearchResult,
} from '@/components/Selector/OrganizationMemberSelector'

const PROJECT_ADMINISTRATOR_SOURCE_SCOPE = { type: 'company' } as const

interface EntityFormValues {
  name: string
  code: string
  description?: string
  administratorUserId: string
  organizationInitializationMode?: 'blank' | 'template'
  templateId?: string
}

export interface EntityFormDialogRef {
  show: () => void
  hide: () => void
}

/** 收集企业或项目资料、稳定管理员 userId 及显式组织初始化方式。 */
export default function EntityFormDialog({
  ref,
  project,
  memberContextKey,
  onSave,
  globalAccountRequest,
  resolveGlobalAccounts,
  memberRequest,
  resolveMembers,
  loadTemplates,
}: {
  ref: Ref<EntityFormDialogRef>
  project: boolean
  /** 当前管理页的完整访问作用域键，用于隔离首位项目管理员候选缓存。 */
  memberContextKey: string
  onSave: (values: CreateCompanyRequest | CreateProjectRequest) => Promise<boolean>
  globalAccountRequest: (input: GlobalAccountSearchRequest) => Promise<GlobalAccountSearchResult>
  resolveGlobalAccounts: GlobalAccountResolver
  memberRequest: (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult>
  resolveMembers: (userIds: string[]) => Promise<OrganizationMemberCandidate[]>
  loadTemplates?: () => Promise<OrganizationTemplateSummary[]>
}) {
  const [open, setOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [templates, setTemplates] = useState<OrganizationTemplateSummary[]>([])
  const { message } = App.useApp()
  const { tr } = useI18n()
  const hide = () => setOpen(false)

  /** 打开创建弹窗；创建项目时预加载当前企业可用模板。 */
  const show = () => {
    setOpen(true)
    if (!project) return
    setLoadingOptions(true)
    const loader = loadTemplates?.()
    void Promise.resolve(loader)
      .then((items) => {
        setTemplates(items ?? [])
      })
      .catch((error) => {
        setTemplates([])
        void message.error(getRequestErrorMessage(error, tr('无法加载可选项')))
      })
      .finally(() => setLoadingOptions(false))
  }

  useImperativeHandle(ref, () => ({ show, hide }))
  const label = project ? tr('项目') : tr('企业')
  return (
    <ModalForm<EntityFormValues>
      title={project ? tr('创建项目') : tr('开通企业')}
      open={open}
      width={680}
      initialValues={project ? { organizationInitializationMode: 'blank' } : undefined}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      submitter={{ searchConfig: { submitText: project ? tr('创建项目') : tr('开通企业') } }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      onFinish={
        /** 规范化实体资料并构造互斥的企业或项目创建请求。 */ async (values) => {
          const common = {
            name: values.name.trim(),
            code: values.code.trim().toLowerCase(),
            description: values.description?.trim(),
            administratorUserId: values.administratorUserId,
          }
          let request: CreateCompanyRequest | CreateProjectRequest
          if (project) {
            const template = templates.find((item) => item.id === values.templateId)
            if (values.organizationInitializationMode === 'template' && !template) return false
            request = {
              ...common,
              organizationInitialization:
                values.organizationInitializationMode === 'template' && template
                  ? { mode: 'template', templateId: template.id, templateVersion: template.version }
                  : { mode: 'blank' },
            }
          } else {
            request = common
          }
          const ok = await onSave(request)
          if (ok) hide()
          return ok
        }
      }
    >
      <ProFormText
        name="name"
        label={tr('{type}名称', { type: label })}
        rules={[
          {
            required: true,
            whitespace: true,
            min: 2,
            max: 100,
            message: tr('请输入 2–100 字{type}名称', { type: label }),
          },
        ]}
        fieldProps={{ maxLength: 100 }}
      />
      <ProFormText
        name="code"
        label={tr('{type}编码', { type: label })}
        extra={tr('2–32 位字母、数字、下划线或短横线。')}
        rules={[
          { required: true, pattern: /^[A-Za-z0-9_-]{2,32}$/, message: tr('请输入有效编码') },
        ]}
        fieldProps={{ maxLength: 32 }}
      />

      {project ? (
        <Form.Item
          name="administratorUserId"
          label={tr('首位项目管理员')}
          rules={[{ required: true, message: tr('请选择首位项目管理员') }]}
          extra={tr('候选人必须是当前企业的有效成员。')}
        >
          <OrganizationMemberSelector
            candidateContextKey={`${memberContextKey}:createProjectAdministrator`}
            scope={PROJECT_ADMINISTRATOR_SOURCE_SCOPE}
            request={memberRequest}
            resolve={resolveMembers}
            placeholder={tr('按姓名、账号、组织或岗位选择')}
          />
        </Form.Item>
      ) : (
        <Form.Item
          name="administratorUserId"
          label={tr('首位企业管理员')}
          rules={[{ required: true, message: tr('请选择首位企业管理员') }]}
          extra={tr('可从平台全部启用账号中搜索；系统会将其加入企业。')}
        >
          <GlobalAccountSelect request={globalAccountRequest} resolve={resolveGlobalAccounts} />
        </Form.Item>
      )}

      {project && (
        <>
          <Alert
            type="info"
            showIcon
            title={tr('项目拥有独立组织和岗位')}
            description={tr('可从空白开始，也可复制企业维护的当前模板；复制后互不联动。')}
            style={{ marginBottom: 16 }}
          />
          <ProFormRadio.Group
            name="organizationInitializationMode"
            label={tr('组织初始化')}
            options={[
              { value: 'blank', label: tr('空白组织') },
              { value: 'template', label: tr('使用企业模板') },
            ]}
          />
          <ProFormDependency name={['organizationInitializationMode']}>
            {({ organizationInitializationMode }) =>
              organizationInitializationMode === 'template' ? (
                <ProFormSelect
                  name="templateId"
                  label={tr('组织模板')}
                  fieldProps={{ loading: loadingOptions }}
                  options={templates.map((template) => ({
                    value: template.id,
                    label: `${template.name} · v${template.version}${template.isDefault ? tr(' · 默认') : ''}`,
                  }))}
                  rules={[{ required: true, message: tr('请选择组织模板') }]}
                  extra={
                    templates.length
                      ? tr('提交时会同时校验模板当前版本。')
                      : tr('暂无可用模板，请选择空白组织或先创建模板。')
                  }
                />
              ) : null
            }
          </ProFormDependency>
        </>
      )}

      <ProFormTextArea
        name="description"
        label={tr('{type}说明', { type: label })}
        fieldProps={{ maxLength: 500, showCount: true, rows: 3 }}
      />
    </ModalForm>
  )
}
