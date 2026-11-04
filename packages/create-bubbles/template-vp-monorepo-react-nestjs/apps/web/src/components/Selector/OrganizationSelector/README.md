# OrganizationSelector

固定双栏的组织选择弹窗，已选标签自然换行，容器使用 `overflow: auto`。不依赖成员、作用域或 API；候选组织与业务禁选规则通过 `show()` 注入。

```tsx
import { OrganizationSelector } from '@/components/Selector'
import type { OrganizationSelectorRef } from '@/components/Selector'

const ref = useRef<OrganizationSelectorRef>(null)

// 默认关闭职责，ids 推断为 string[]。
<OrganizationSelector ref={ref} onConfirm={(ids, records) => console.log(ids, records)} />
ref.current?.show({ units, value: ['org-demo-1'], multiple: false })

// 开启职责，relations 推断为 OrganizationRelationInput[]。
<OrganizationSelector ref={ref} enableDuties onConfirm={(relations, records) => console.log(relations, records)} />
ref.current?.show({
  units,
  relations: [{ organizationUnitId: 'org-demo-1', duty: 'leader' }],
})
```

两段用法分别使用独立实例。`enableDuties={false}` 与省略开关一致，仅读取 `value`，忽略 `relations`；开启时读取 `relations`，若同时提供 `value`，以它决定选中 ID。确认值按选中顺序去重，空选择返回 `[]`。新增或移除后重新选择的组织默认职责为 `member`。

`onConfirm` 第二参数始终为 `OrganizationUnitNode[]`，按选中顺序输出实际组织候选的完整记录；职责保留在第一参数。缺失记录不伪造、不删除原 ID，应通过主键关联两参数；空选择确认返回 `([], [])`。

`show({ multiple: false })` 单选，省略或 true 多选；单选选择另一组织替换旧项，传入多项仅取第一项。两种模式确认均为数组，职责开关不影响单选／多选能力。

`onConfirm` 返回 `false` 或抛出异常会保留草稿以便重试；其他正常返回会关闭弹窗。提交中禁止编辑、关闭、重复确认或重新打开。`hide()` 取消不触发确认。

`show()` 可选传入 `title`、`description`（ReactNode）、`isOrganizationDisabled(unit)`、`isDutyDisabled({ unit, duty })`。禁选回调限制新增，已有组织仍可移除。通用组件默认不限制候选；有效性、成员状态等规则由业务注入。

正式规则见[技术契约](../../../../../../.spaces/01.企业级项目级/组织架构/技术契约.md#组织选择职责参数)。
