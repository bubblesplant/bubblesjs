import { ModalForm, ProFormSelect } from '@ant-design/pro-components'
import { Alert, Form } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  AdministratorSummary,
  CompanyRecord,
  OrganizationMemberCandidate,
  SetAdministratorRequest,
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

export interface AdministratorDialogRef {
  show: (record: CompanyRecord, administrators: AdministratorSummary[]) => void
  hide: () => void
}

/** 展示现有管理员，按企业或项目权限域选择稳定 userId 进行补充或替换。 */
export default function AdministratorDialog({
  ref,
  project,
  memberContextKey,
  globalAccountRequest,
  resolveGlobalAccounts,
  memberRequest,
  resolveMembers,
  onSave,
}: {
  ref: Ref<AdministratorDialogRef>
  project: boolean
  /** 当前管理页的完整访问作用域键，用于隔离项目管理员候选缓存。 */
  memberContextKey: string
  globalAccountRequest: (input: GlobalAccountSearchRequest) => Promise<GlobalAccountSearchResult>
  resolveGlobalAccounts: GlobalAccountResolver
  memberRequest: (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult>
  resolveMembers: (userIds: string[]) => Promise<OrganizationMemberCandidate[]>
  onSave: (record: CompanyRecord, input: SetAdministratorRequest) => Promise<boolean>
}) {
  const [record, setRecord] = useState<CompanyRecord>()
  const [administrators, setAdministrators] = useState<AdministratorSummary[]>([])
  const [open, setOpen] = useState(false)
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 载入待维护实体及现有管理员，打开管理员设置弹窗。 */
    show: (item, admins) => {
      setRecord(item)
      setAdministrators(admins)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<SetAdministratorRequest>
      title={tr('设置{type}管理员 · {name}', {
        type: project ? tr('项目') : tr('企业'),
        name: record?.name ?? '',
      })}
      open={open}
      width={640}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存管理员') } }}
      onFinish={
        /** 按稳定 userId 和可选替换对象提交管理员设置。 */ async (values) => {
          if (!record) return false
          const ok = await onSave(record, {
            administratorUserId: values.administratorUserId,
            ...(values.replaceUserId ? { replaceUserId: values.replaceUserId } : {}),
          })
          if (ok) hide()
          return ok
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('补充或更换管理员')}
        description={tr(
          '不选择被替换者表示补充管理员。更换时仅撤销旧管理员身份，保留其成员关系及其他角色；此操作不会启用已停用的工作空间。',
        )}
        style={{ marginBottom: 20 }}
      />
      <Form.Item
        name="administratorUserId"
        label={tr('新管理员')}
        rules={[{ required: true, message: tr('请选择新管理员') }]}
        extra={project ? tr('新管理员须为有效企业成员。') : tr('新管理员须为有效全局账号。')}
      >
        {project ? (
          <OrganizationMemberSelector
            candidateContextKey={`${memberContextKey}:setProjectAdministrator`}
            scope={PROJECT_ADMINISTRATOR_SOURCE_SCOPE}
            request={memberRequest}
            resolve={resolveMembers}
            placeholder={tr('选择企业成员')}
          />
        ) : (
          <GlobalAccountSelect request={globalAccountRequest} resolve={resolveGlobalAccounts} />
        )}
      </Form.Item>
      <ProFormSelect
        name="replaceUserId"
        label={tr('被替换的管理员（可选）')}
        placeholder={tr('不选择，补充管理员')}
        allowClear
        options={administrators.map((admin) => ({
          value: admin.id,
          label: `${admin.name} (${admin.account})${admin.effective ? '' : tr(' · 当前无效')}`,
        }))}
      />
    </ModalForm>
  )
}
