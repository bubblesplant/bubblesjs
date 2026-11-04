# OrganizationMemberSelector

Select 风格的组织成员选择器。点击字段后打开“左侧组织浏览 + 中间分页人员 + 右侧已选容器”的弹窗，复用 `BasicTableSelector`，支持搜索、跨页选择、按可见作用域/组织/岗位/角色筛选、批量 resolve 回显与候选禁选。

已选容器空选时也占位，数量和清空操作固定在顶部；列表使用 `overflow: auto`，标签按内容宽度横向连续排列，放不下自动换行，长姓名或账号在容器内换行。选择、移除和清空不会撑高弹窗或推动表格重排。窄屏上下排列，组织筛选面板占满宽度并按内容收缩，已选容器固定 160px。需求与证据见[成员选择布局需求](../../../../../../.spaces/01.企业级项目级/组织架构/需求文档.md#fr-07-组织成员选择器)和[专项测试报告](../../../../../../.spaces/01.企业级项目级/组织架构/测试报告.md#2026-11-04-成员选择布局专项)。

- `multiple={false}`（默认）单选、`multiple` 多选。两种模式的值和 `onChange` 首参数均为 `string[]`，单选最多一项，清空为 `[]`。
- 搜索与 resolve 请求必须由业务页面注入，组件不决定 URL 或权限 purpose。
- `scope` 只展示当前 URL 作用域；企业可通过 `filters.projects` 和 `loadProjectFilters` 浏览获准查看的项目身份。
- `selectedCandidates` 只用于回显快照，不改变最终表单值。
- `onChange(ids, records: OrganizationMemberCandidate[])` 第二参数提供候选实际返回的完整记录，按 ID 顺序输出；清空调用 `onChange([], [])`。默认选中仍传 ID 数组，补查回显不触发回调。缺失记录不伪造，应按 `userId` 关联两参数。
