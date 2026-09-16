import {
  ModalForm,
  ProFormCheckbox,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components'
import { Alert, Form, Space, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CreateOrganizationTemplateRequest, OrganizationTemplateRecord } from 'shared/types'
import TemplateDefinitionTabs from './TemplateDefinitionTabs'
import type { TemplateFormValues } from './types'

export interface OrganizationTemplateDialogRef {
  show: (record?: OrganizationTemplateRecord) => void
  hide: () => void
}

/** 把模板当前版本转换为可编辑表单值。 */
function templateFormValues(record?: OrganizationTemplateRecord): TemplateFormValues {
  return {
    name: record?.name ?? '',
    description: record?.description ?? '',
    isDefault: record?.isDefault ?? false,
    units:
      record?.units.map((unit) => ({
        clientKey: unit.id,
        parentClientKey: unit.parentId,
        name: unit.name,
        code: unit.code,
        description: unit.description,
        sort: unit.sort,
      })) ?? [],
    positions:
      record?.positions.map((position) => ({
        name: position.name,
        code: position.code,
        description: position.description,
        status: position.status,
      })) ?? [],
  }
}

/** 编辑模板基本信息、组织单元树定义和独立岗位列表。 */
export default function OrganizationTemplateDialog({
  ref,
  onSave,
}: {
  ref: Ref<OrganizationTemplateDialogRef>
  onSave: (
    values: CreateOrganizationTemplateRequest,
    record?: OrganizationTemplateRecord,
  ) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<OrganizationTemplateRecord>()
  const [form] = Form.useForm<TemplateFormValues>()
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 载入模板当前完整定义并打开编辑器；省略记录时创建新模板。 */
    show: (item) => {
      setRecord(item)
      form.setFieldsValue(templateFormValues(item))
      setOpen(true)
    },
    hide,
  }))

  return (
    <ModalForm<TemplateFormValues>
      form={form}
      title={record ? tr('编辑项目组织模板') : tr('创建项目组织模板')}
      open={open}
      width={1000}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存模板') } }}
      onFinish={
        /** 规范化完整模板定义并提交，父子关系只使用本次请求 clientKey。 */ async (values) => {
          const input: CreateOrganizationTemplateRequest = {
            name: values.name.trim(),
            description: values.description?.trim(),
            isDefault: values.isDefault,
            units: (values.units ?? []).map((unit) => ({
              clientKey: unit.clientKey,
              parentClientKey: unit.parentClientKey ?? null,
              name: unit.name.trim(),
              code: unit.code.trim().toLowerCase(),
              description: unit.description?.trim(),
              sort: unit.sort,
            })),
            positions: (values.positions ?? []).map((position) => ({
              name: position.name.trim(),
              code: position.code.trim().toLowerCase(),
              description: position.description?.trim(),
              status: position.status,
            })),
          }
          const ok = await onSave(input, record)
          if (ok) hide()
          return ok
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('模板只在创建项目时复制一次')}
        description={tr('之后修改模板不会同步到已有项目；模板岗位独立于模板组织单元。')}
        style={{ marginBottom: 20 }}
      />
      <Space align="start" size={16} style={{ width: '100%' }}>
        <ProFormText
          name="name"
          label={tr('模板名称')}
          width="md"
          rules={[{ required: true, whitespace: true, min: 2, max: 100 }]}
          fieldProps={{ maxLength: 100 }}
        />
        <ProFormCheckbox name="isDefault">{tr('作为默认模板')}</ProFormCheckbox>
      </Space>
      <ProFormTextArea
        name="description"
        label={tr('模板说明')}
        fieldProps={{ maxLength: 500, showCount: true, rows: 2 }}
      />
      <TemplateDefinitionTabs form={form} />
      <Typography.Text type="secondary">
        {tr('组织单元最多 10 层；保存时服务端会校验父子引用、循环、名称和编码唯一性。')}
      </Typography.Text>
    </ModalForm>
  )
}
