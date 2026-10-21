import {
  ModalForm,
  ProFormDigit,
  ProFormGroup,
  ProFormList,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from '@ant-design/pro-components'
import { App, Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CreateDictionaryRequest, DictionaryRecord } from 'shared/types'
import { createDictionarySchema, DICTIONARY_CODE_PATTERN, DICTIONARY_MAX_ITEMS } from 'shared/utils'

export interface DictionaryFormDialogRef {
  show: (record?: DictionaryRecord) => void
  hide: () => void
}

/** 维护整份字典，已保存项仅允许编辑名称、排序和启停，保留稳定业务值。 */
export default function DictionaryFormDialog({
  ref,
  onSave,
}: {
  ref: Ref<DictionaryFormDialogRef>
  onSave: (body: CreateDictionaryRequest, record?: DictionaryRecord) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<DictionaryRecord>()
  const { message } = App.useApp()
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  const statuses = [
    { label: tr('启用'), value: 'active' },
    { label: tr('停用'), value: 'disabled' },
  ]
  useImperativeHandle(ref, () => ({
    /** 未传记录新增，传记录时保留服务端版本进行编辑。 */
    show: (item) => {
      setRecord(item)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<CreateDictionaryRequest>
      title={record ? tr('编辑数据字典') : tr('新增数据字典')}
      open={open}
      width={900}
      initialValues={record ?? { description: '', status: 'active', items: [] }}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(value) => {
        if (!value) hide()
      }}
      onFinish={
        /** 使用共享规则校验重复值及字段长度，保存成功才关闭。 */
        async (values) => {
          const parsed = createDictionarySchema.safeParse({
            code: record?.code ?? values.code,
            name: values.name,
            description: values.description,
            status: values.status,
            items: values.items ?? [],
          })
          if (!parsed.success) {
            void message.error(parsed.error.issues[0]?.message ?? tr('请检查字典内容'))
            return false
          }
          const ok = await onSave(parsed.data, record)
          if (ok) hide()
          return ok
        }
      }
    >
      <ProFormGroup>
        <ProFormText
          name="code"
          label={tr('字典编码')}
          disabled={Boolean(record)}
          width="md"
          rules={[
            {
              required: true,
              max: 64,
              pattern: DICTIONARY_CODE_PATTERN,
              message: tr('使用小写字母开头的字母、数字或下划线，最长 64 字符'),
            },
          ]}
          fieldProps={{ maxLength: 64 }}
        />
        <ProFormText
          name="name"
          label={tr('字典名称')}
          width="md"
          rules={[{ required: true, whitespace: true, max: 100 }]}
          fieldProps={{ maxLength: 100 }}
        />
        <ProFormSelect
          name="status"
          label={tr('状态')}
          options={statuses}
          allowClear={false}
          width="xs"
        />
      </ProFormGroup>
      <ProFormTextArea
        name="description"
        label={tr('说明')}
        fieldProps={{ maxLength: 500, rows: 2, showCount: true }}
      />
      <Alert
        type="info"
        showIcon
        title={tr('保存后的字典编码和选项值保持不变。不再使用的选项请停用。')}
      />
      <ProFormList
        name="items"
        label={tr('字典选项')}
        max={DICTIONARY_MAX_ITEMS}
        creatorButtonProps={{ creatorButtonText: tr('新增选项') }}
        creatorRecord={{ value: '', label: '', sort: 0, status: 'active' }}
        copyIconProps={false}
        actionRender={(field, _action, defaults) =>
          field.name < (record?.items.length ?? 0) ? [] : defaults
        }
      >
        {(field) => (
          <ProFormGroup key={field.key}>
            <ProFormText
              name="value"
              label={tr('选项值')}
              width="sm"
              disabled={field.name < (record?.items.length ?? 0)}
              rules={[{ required: true, whitespace: true, max: 100 }]}
              fieldProps={{ maxLength: 100 }}
            />
            <ProFormText
              name="label"
              label={tr('显示名称')}
              width="sm"
              rules={[{ required: true, whitespace: true, max: 100 }]}
              fieldProps={{ maxLength: 100 }}
            />
            <ProFormDigit
              name="sort"
              label={tr('排序')}
              min={0}
              max={999999}
              fieldProps={{ precision: 0 }}
              width="xs"
            />
            <ProFormSelect
              name="status"
              label={tr('状态')}
              options={statuses}
              allowClear={false}
              width="xs"
            />
          </ProFormGroup>
        )}
      </ProFormList>
    </ModalForm>
  )
}
