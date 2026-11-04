# GlobalAccountSelect

表单内使用的全局账号选择字段。点击字段或按回车、空格、向下方向键后打开分页账号选择弹窗；它只查找平台已注册账号，不展示企业或项目组织树，并始终使用全局 `userId` 作为值。

组件固定处理：

- 字段挂载不预加载候选；打开弹窗后分页浏览，默认每页 20 条，支持姓名或账号搜索。
- `multiple={false}`（默认）单选、`multiple` 多选；复用 `BasicTableSelector` 提供分页、跨页选择、已选摘要和查询失败提示，默认查询防抖为 300ms。
- 只展示服务端搜索结果，不在前端二次过滤；关闭、重新查询或组件卸载会取消或忽略过期请求。
- 结果按 `userId` 去重，展示姓名、完整账号和可选状态。
- 临时选择只在点击确定后回填，取消保留原表单值；字段清空可直接更新受控值。
- 锁定或停用账号显示但禁止选择。
- 按稳定 `userId` 补查初始值或外部变更值，并缓存当前选中账号。
- 搜索与补查必须绑定同一业务 purpose；未知账号不会伪造成候选或显示裸 `userId`。
- 值变化、请求竞态或组件卸载时取消并忽略过期补查，同一空结果或失败值不会自动循环请求。
- 作为受控组件使用，表单默认值放在 `Form.initialValues`，不要给字段组件传 `defaultValue`。

```tsx
import { Form } from 'antd'
import { GlobalAccountSelect } from '@/components/Selector'

export default function AdministratorField() {
  return (
    <Form.Item name="administratorUserIds" label="首位企业管理员" required>
      <GlobalAccountSelect
        multiple={false}
        request={searchCompanyAdministratorCandidates}
        resolve={resolveCompanyAdministratorCandidates}
      />
    </Form.Item>
  )
}
```

`value?: string[]`、`onChange(userIds: string[], accounts: GlobalAccountOption[])` 始终使用数组；单选最多一项，清空为 `[]`。编辑时在 `Form.initialValues` 中提供 `administratorUserIds: ['user-id']`，用 `selectedAccounts` 提供多项快照，或保留 `selectedAccount` 单项快照，避免首次补查。业务需要单个 ID 时在提交层取 `values.administratorUserIds[0]`。

`request` 和 `resolve` 必须由业务页面同时注入，并调用与当前操作权限及 purpose 一致的候选接口。组件不能直接依赖账号管理列表接口，也不会在选择时创建成员关系或授予角色。企业/项目、角色和部门树属于组织成员选择器，不放入全局账号选择弹窗。

第二参数保留候选实际返回的完整字段并按 `userId` 顺序输出；确认、标签移除和清空同步更新两参数，清空为 `([], [])`。初始值补查、程序赋值和重置不触发回调；缺失记录不伪造，应通过 `userId` 核对缺失。
