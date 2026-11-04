# RoleSelect

可直接放入 `ProFormItem` 的角色字段，`multiple={false}` 单选，默认多选。两种模式均为 `value?: string[]`、`onChange(ids: string[], records: RoleRecord[])`，单选最多一项，候选通过 `roles` 提供。确认才写入表单，取消保留原值，清空调用 `onChange([], [])`。第二参数保留候选完整字段并按 ID 顺序输出；缺失记录不伪造，原 ID 仍保留。支持标准 Select 属性。

默认只允许新增 `assignable` 角色；`originalRoleIds` 保留原有受限角色的撤销／恢复资格。可用 `isRoleDisabled` 注入业务禁选。完整示例见[选择器集合](../README.md)。
