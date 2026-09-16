# OrganizationMemberSelector

Select 风格的组织成员选择器。点击字段后打开“左侧组织浏览 + 右侧分页人员”的弹窗，支持搜索、跨页选择、按可见作用域/组织/岗位/角色筛选、批量 resolve 回显与候选禁选。

- 单选值为 `userId | undefined`，多选值为 `userId[]`。
- 搜索与 resolve 请求必须由业务页面注入，组件不决定 URL 或权限 purpose。
- `scope` 只展示当前 URL 作用域；企业可通过 `filters.projects` 和 `loadProjectFilters` 浏览获准查看的项目身份。
- `selectedCandidates` 只用于回显快照，不改变最终表单值。
