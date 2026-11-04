# OrganizationSelect

可直接放入 `ProFormItem` 的组织字段，`multiple={false}` 单选，默认多选。两种模式均使用数组：默认 `value?: string[]`；`enableDuties` 开启时为 `OrganizationRelationInput[]`，`onChange` 类型同步切换。单选最多一项，清空为 `[]`。候选通过 `units` 提供，支持完整路径回显与标准 Select 属性。

用法和开关输出见[选择器集合](../README.md)。独立弹窗使用 [OrganizationSelector](../OrganizationSelector/README.md)。正式规则见[技术契约](../../../../../../.spaces/01.企业级项目级/组织架构/技术契约.md#选择器表单字段契约2026-11-04)。

两种职责模式均提供 `onChange(values, records: OrganizationUnitNode[])`。默认第一参数为 ID 数组，开启职责后为关系数组；第二参数保留组织候选完整字段，不混入职责，通过 `organizationUnitId` 关联。记录按值顺序输出，缺失记录不伪造且保留原 ID；清空调用 `onChange([], [])`。默认值仍交给表单 `initialValues`。
