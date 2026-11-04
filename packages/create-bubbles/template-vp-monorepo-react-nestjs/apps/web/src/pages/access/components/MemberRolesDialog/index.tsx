import { ModalForm, ProFormItem } from '@ant-design/pro-components'
import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { AccountRecord, MemberRecord, RoleRecord } from 'shared/types'
import { RoleSelect } from '@/components/Selector'

export interface MemberRolesDialogRef {
  show: (record: MemberRecord | AccountRecord, roles: RoleRecord[]) => void
  hide: () => void
}
/** 展示成员当前角色与可分配角色，提交最新角色选择。 */
export default function MemberRolesDialog({
  ref,
  onSave,
}: {
  ref: Ref<MemberRolesDialogRef>
  onSave: (record: MemberRecord | AccountRecord, roleIds: string[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<MemberRecord | AccountRecord>()
  const [roles, setRoles] = useState<RoleRecord[]>([])
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  const selected = record
    ? 'platformRoleIds' in record
      ? record.platformRoleIds
      : record.roleIds
    : []
  useImperativeHandle(ref, () => ({
    /** 载入目标成员和可选角色，打开角色分配弹窗。 */
    show: (item, options) => {
      setRecord(item)
      setRoles(options)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<{ roleIds: string[] }>
      key={record?.id}
      title={tr('分配角色 · {name}', { name: record?.name ?? '' })}
      open={open}
      width={580}
      initialValues={{ roleIds: selected }}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存角色') } }}
      onFinish={
        /** 提交成员最新角色集合，保存成功后关闭弹窗。 */ async (values) => {
          if (!record) return false
          const ok = await onSave(record, values.roleIds ?? [])
          if (ok) hide()
          return ok
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('多个角色的权限合并生效')}
        description={tr(
          '这里只修改当前工作空间的角色。撤销管理员身份受委派资格和最后有效管理员保护。',
        )}
        style={{ marginBottom: 20 }}
      />
      <ProFormItem
        name="roleIds"
        label={tr('角色')}
        extra={tr('选择角色；留空表示撤销当前范围全部角色')}
      >
        <RoleSelect roles={roles} originalRoleIds={selected} />
      </ProFormItem>
    </ModalForm>
  )
}
