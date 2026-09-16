import {
  ModalForm,
  ProFormDependency,
  ProFormDigit,
  ProFormRadio,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components'
import { Alert, App, Form, Spin } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CompanyEntityType,
  CompanyHierarchyNode,
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
  parentCompanyId?: string
  entityType?: CompanyEntityType
  sort?: number
  organizationInitializationMode?: 'blank' | 'template'
  templateId?: string
}

export interface EntityFormDialogRef {
  show: () => void
  hide: () => void
}

/** 将企业层级树压平成父企业选择项，同时保留层级缩进。 */
function companyOptions(
  nodes: CompanyHierarchyNode[],
  depth = 0,
): Array<{ value: string; label: string }> {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}` },
    ...companyOptions(node.children, depth + 1),
  ])
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
  loadCompanyTree,
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
  loadCompanyTree?: () => Promise<CompanyHierarchyNode[]>
  loadTemplates?: () => Promise<OrganizationTemplateSummary[]>
}) {
  const [open, setOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [companies, setCompanies] = useState<CompanyHierarchyNode[]>([])
  const [templates, setTemplates] = useState<OrganizationTemplateSummary[]>([])
  const { message } = App.useApp()
  const { tr } = useI18n()
  const hide = () => setOpen(false)

  /** 打开弹窗并按实体类型预加载企业树或可用模板。 */
  const show = () => {
    setOpen(true)
    setLoadingOptions(true)
    const loader = project ? loadTemplates?.() : loadCompanyTree?.()
    void Promise.resolve(loader)
      .then((items) => {
        if (project) setTemplates((items as OrganizationTemplateSummary[] | undefined) ?? [])
        else setCompanies((items as CompanyHierarchyNode[] | undefined) ?? [])
      })
      .catch((error) => {
        if (project) setTemplates([])
        else setCompanies([])
        void message.error(error instanceof Error ? error.message : tr('无法加载可选项'))
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
      initialValues={
        project ? { organizationInitializationMode: 'blank' } : { entityType: 'company', sort: 1 }
      }
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
            request = {
              ...common,
              parentCompanyId: values.parentCompanyId ?? null,
              entityType: values.entityType ?? 'company',
              sort: values.sort,
            }
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

      {project ? (
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
      ) : (
        <Spin spinning={loadingOptions}>
          <ProFormSelect
            name="parentCompanyId"
            label={tr('上级企业 / 集团')}
            allowClear
            placeholder={tr('不选择表示根级企业')}
            options={companyOptions(companies)}
            fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
          />
          <ProFormRadio.Group
            name="entityType"
            label={tr('实体类型')}
            options={[
              { value: 'company', label: tr('企业') },
              { value: 'group', label: tr('集团') },
            ]}
          />
          <ProFormDigit
            name="sort"
            label={tr('同级排序')}
            min={0}
            max={999999999}
            fieldProps={{ precision: 0 }}
          />
        </Spin>
      )}

      <ProFormTextArea
        name="description"
        label={tr('{type}说明', { type: label })}
        fieldProps={{ maxLength: 500, showCount: true, rows: 3 }}
      />
    </ModalForm>
  )
}
