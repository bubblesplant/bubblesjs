# PositionSelector

与表单字段 [PositionSelect](../PositionSelect/README.md) 共用的独立岗位弹窗，不依赖成员或 API。通过 ref 暴露 `show(options)`／`hide()`，通过 `onConfirm(ids, records: PositionRecord[])` 输出稳定岗位 ID 数组和完整候选记录数组。

```tsx
const ref = useRef<PositionSelectorRef>(null)
<PositionSelector ref={ref} onConfirm={(ids, records) => console.log(ids, records)} />
ref.current?.show({ positions, value: ['position-demo-1'], multiple: false })
```

`multiple` 默认 true，false 为单选；两种模式始终返回数组，单选最多一项，清空为 `[]`。打开参数还支持 `title`、`description`、`isPositionDisabled`。已有项可移除；默认禁止新增停用岗位。确认返回 `false` 或抛错保留草稿，其余正常返回关闭；提交期间锁定编辑、取消与重新打开。正式规则见[技术契约](../../../../../../.spaces/01.企业级项目级/组织架构/技术契约.md#选择器表单字段契约2026-11-04)。

完整记录按 ID 顺序输出；缺失记录不伪造、不删除原 ID，应通过稳定主键关联两参数。空选择确认调用 `onConfirm([], [])`。
