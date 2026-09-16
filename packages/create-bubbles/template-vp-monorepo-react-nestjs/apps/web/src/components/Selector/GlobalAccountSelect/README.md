# GlobalAccountSelect

表单内使用的远程搜索单选框。它只查找平台已注册账号，不展示企业或项目组织树，并始终使用全局 `userId` 作为值。

组件固定处理：

- 不预加载全平台账号；默认输入至少 2 个字符后查询。
- 默认 300ms 防抖，并取消或忽略过期请求。
- 只展示当前关键词的服务端搜索结果，不在前端二次过滤。
- 结果按 `id` 去重，展示姓名、完整账号和状态。
- 锁定或停用账号显示但禁止选择。
- 缓存当前选中账号，后续搜索不会把回显降级为裸 `userId`。
- 作为受控组件使用，表单默认值放在 `Form.initialValues`，不要给字段组件传 `defaultValue`。

```tsx
import { Form } from 'antd'
import { GlobalAccountSelect } from '@/components/Selector'

export default function AdministratorField() {
  return (
    <Form.Item name="administratorUserId" label="首位企业管理员" required>
      <GlobalAccountSelect request={searchCompanyAdministratorCandidates} />
    </Form.Item>
  )
}
```

编辑场景除在 `Form.initialValues` 中提供 `administratorUserId` 外，还应通过 `selectedAccount` 传入该账号的最小快照，确保首次回显姓名和完整账号。

`request` 必须由业务页面注入，并调用与当前操作权限一致的候选接口。组件不能直接依赖账号管理列表接口，也不会在选择时创建成员关系或授予角色。企业/项目、角色和部门树属于另一类组织成员选择器，不应塞进这个全局账号下拉框。
