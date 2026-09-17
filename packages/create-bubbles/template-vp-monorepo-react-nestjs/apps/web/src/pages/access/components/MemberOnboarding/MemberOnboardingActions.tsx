import { MailOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import { Button, Space } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  AddProjectMemberRequest,
  OrganizationScope,
  RegisterCompanyMemberRequest,
} from 'shared/types'
import type { managementApi } from '../../api'
import {
  createOrganizationMemberResolver,
  createOrganizationMemberSearch,
} from '../EntitySelectors/selector-requests'
import AddProjectMemberDialog, { type AddProjectMemberDialogRef } from './AddProjectMemberDialog'
import CompanyMemberInvitationDialog, {
  type CompanyMemberInvitationDialogRef,
} from './CompanyMemberInvitation/CompanyMemberInvitationDialog'
import RegisterCompanyMemberDialog, {
  type RegisterCompanyMemberDialogRef,
} from './RegisterCompanyMember/RegisterCompanyMemberDialog'

type ManagementApi = ReturnType<typeof managementApi>

export interface MemberOnboardingActionsProps {
  scope: OrganizationScope
  memberContextKey: string
  api: ManagementApi
  onRegisterCompanyMember: (data: RegisterCompanyMemberRequest) => Promise<boolean>
  onAddProjectMember: (data: AddProjectMemberRequest) => Promise<boolean>
}

/** 按企业或项目作用域展示唯一允许的成员接入入口及对应弹窗。 */
export default function MemberOnboardingActions({
  scope,
  memberContextKey,
  api,
  onRegisterCompanyMember,
  onAddProjectMember,
}: MemberOnboardingActionsProps) {
  const registerRef = useRef<RegisterCompanyMemberDialogRef>(null)
  const invitationRef = useRef<CompanyMemberInvitationDialogRef>(null)
  const projectRef = useRef<AddProjectMemberDialogRef>(null)
  const { tr } = useI18n()

  if (scope.type === 'project')
    return (
      <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => projectRef.current?.show()}>
          {tr('添加成员')}
        </Button>
        <AddProjectMemberDialog
          ref={projectRef}
          memberContextKey={memberContextKey}
          request={createOrganizationMemberSearch(api, 'addProjectMember')}
          resolve={createOrganizationMemberResolver(api, 'addProjectMember')}
          onSave={onAddProjectMember}
        />
      </>
    )

  return (
    <>
      <Space size="small">
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => registerRef.current?.show()}
        >
          {tr('直接注册')}
        </Button>
        <Button icon={<MailOutlined />} onClick={() => invitationRef.current?.show()}>
          {tr('邀请成员')}
        </Button>
      </Space>
      <RegisterCompanyMemberDialog ref={registerRef} onSave={onRegisterCompanyMember} />
      <CompanyMemberInvitationDialog ref={invitationRef} api={api} />
    </>
  )
}
