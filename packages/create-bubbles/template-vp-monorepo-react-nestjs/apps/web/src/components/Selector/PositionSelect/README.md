# PositionSelect

可直接放入 `ProFormItem` 的岗位字段，`multiple={false}` 单选，默认多选。两种模式均为 `value?: string[]`、`onChange(ids: string[], records: PositionRecord[])`，单选最多一项，清空调用 `onChange([], [])`，候选通过 `positions` 提供。第二参数保留候选完整字段并按 ID 顺序输出；缺失记录不伪造，原 ID 仍保留。支持标准 Select 属性、名称与编码回显；默认禁止新增停用岗位，已选可移除。`isPositionDisabled` 可注入完整业务禁选规则。

用法见[选择器集合](../README.md)，独立弹窗见 [PositionSelector](../PositionSelector/README.md)。
