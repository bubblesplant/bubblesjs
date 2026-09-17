import { ModalForm } from '@ant-design/pro-components'
import { Form } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { AddProjectMemberRequest, OrganizationMemberCandidate } from 'shared/types'
import OrganizationMemberSelector from '@/components/Selector/OrganizationMemberSelector'
import type {
  OrganizationMemberSearchRequest,
  OrganizationMemberSearchResult,
} from '@/components/Selector/OrganizationMemberSelector'

const PROJECT_MEMBER_SOURCE_SCOPE = { type: 'company' } as const

export interface AddProjectMemberDialogRef {
  show: () => void
  hide: () => void
}

/** 从项目所属企业的有效成员中选择用户，并以稳定 userId 添加项目成员。 */
export default function AddProjectMemberDialog({
  ref,
  memberContextKey,
  request,
  resolve,
  onSave,
}: {
  ref: Ref<AddProjectMemberDialogRef>
  memberContextKey: string
  request: (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult>
  resolve: (userIds: string[]) => Promise<OrganizationMemberCandidate[]>
  onSave: (data: AddProjectMemberRequest) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 打开项目成员选择弹窗。 */
    show: () => setOpen(true),
    hide,
  }))

  return (
    <ModalForm<AddProjectMemberRequest>
      title={tr('添加项目成员')}
      open={open}
      width={640}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('添加成员') } }}
      onFinish={
        /** 提交选择器返回的稳定 userId，成功后关闭弹窗。 */ async (values) => {
          const ok = await onSave({ userId: values.userId })
          if (ok) hide()
          return ok
        }
      }
    >
      <Form.Item
        name="userId"
        label={tr('企业成员')}
        rules={[{ required: true, message: tr('请选择企业成员') }]}
        extra={tr('只能选择所属企业中有效且尚未加入本项目的成员。')}
      >
        <OrganizationMemberSelector
          candidateContextKey={`${memberContextKey}:addProjectMember`}
          scope={{ ...PROJECT_MEMBER_SOURCE_SCOPE, label: tr('所属企业') }}
          request={request}
          resolve={resolve}
          placeholder={tr('选择企业成员')}
        />
      </Form.Item>
    </ModalForm>
  )
}
