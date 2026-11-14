import type { SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
/** 声明业务表单的文本长度和必填校验。 */
export function textField(name: string, title: string, required = true): SchemaFormColumn {
  return {
    dataIndex: name,
    title,
    valueType: 'text',
    fieldProps: { maxLength: 128 },
    formItemProps: {
      rules: required ? [{ required: true, whitespace: true, message: '请填写此字段' }] : [],
    },
  }
}
/** 密码不裁剪、不回显，最少八位。 */
export function passwordField(name: string, title: string): SchemaFormColumn {
  return {
    dataIndex: name,
    title,
    valueType: 'password',
    fieldProps: { autocomplete: 'new-password', maxLength: 128 },
    formItemProps: {
      rules: [
        { required: true, message: '请填写此字段' },
        { min: 8, message: '密码至少 8 位' },
      ],
    },
  }
}
export const descriptionField: SchemaFormColumn = {
  dataIndex: 'description',
  title: '说明',
  valueType: 'textarea',
  fieldProps: { maxLength: 500, rows: 3 },
}
/** 在页面响应式上下文中翻译状态，随语言切换更新。 */
export function statusEnum(tr: (key: string) => string) {
  return {
    active: { text: tr('启用'), status: 'Success' },
    disabled: { text: tr('停用'), status: 'Default' },
    locked: { text: tr('锁定'), status: 'Warning' },
  }
}
