# Selector

前端选择器组件集合。不同交互形态拆成独立组件，不通过一个庞大的 `mode` 参数混合。

可运行示例：启动 Web 后访问 `/examples/selector`，或点击基础导航“选择器示例”。[完整示例源码](../../pages/examples/selector/index.tsx)包含企业／项目和单选／多选切换、六个表单字段、职责两种输出、校验、禁用、清空、赋值、重置和提交 JSON；候选均为本地虚构数据。

| 组件                       | 适用场景                                 | 值                     |
| -------------------------- | ---------------------------------------- | ---------------------- |
| `BasicTableSelector`       | 弹窗表格、分页、跨页单选或多选           | 稳定行 key 数组        |
| `GlobalAccountSelect`      | 表单字段，全局账号单选／多选             | 全局 `userId` 数组     |
| `OrganizationMemberSelect` | 表单字段，成员单选／多选，可按组织等筛选 | 全局 `userId` 数组     |
| `RoleSelect`               | 表单字段，角色单选／多选                 | 角色 ID 数组           |
| `OrganizationSelect`       | 表单字段，组织单选／多选，可启用职责     | 组织 ID 或组织关系数组 |
| `PositionSelect`           | 表单字段，岗位单选／多选                 | 岗位 ID 数组           |
| `OrganizationSelector`     | 独立组织选择弹窗，支持职责               | 组织 ID 或组织关系数组 |
| `PositionSelector`         | 独立岗位选择弹窗                         | 岗位 ID 数组           |

五类表单字段均使用标准 `value`／`onChange`，直接放进 `ProFormItem`，由表单管理初始值、校验、提交和重置，无需自定义 `getValueFromEvent`。`OrganizationMemberSelector` 是 `OrganizationMemberSelect` 的兼容名，两者均采用数组值契约。

统一回调为 `onChange(values, records)`。表单保存第一参数，编辑默认值仍传 ID 字符串数组；职责组织传关系数组。第二参数分别为 `GlobalAccountCandidate[]`、`OrganizationMemberCandidate[]`、`RoleRecord[]`、`OrganizationUnitNode[]`、`PositionRecord[]`，保留当前权限下候选来源实际提供的完整字段。记录去重并按值顺序输出；缺失记录不伪造，原 ID 保留且标签提示不可用，此时通过稳定主键关联两参数。清空调用 `onChange([], [])`；初始回显、程序赋值和重置不触发回调。

示例页的“选择回调”展示每个字段最近一次真实 `{ values, records }` 快照；程序赋值、重置和切换模式／作用域清除旧快照。

统一使用 `multiple={false}` 单选、`multiple` 多选；账号／成员默认单选，角色／组织／岗位默认多选。两种模式均输出数组，单选为 `[id]`，清空为 `[]`。单选传入多项时仅展示及确认第一项，渲染不触发回调。单 ID 业务接口应在提交层读取数组首项。

```tsx
import { ProForm, ProFormItem } from '@ant-design/pro-components'
import {
  GlobalAccountSelect,
  OrganizationMemberSelect,
  RoleSelect,
  OrganizationSelect,
  PositionSelect,
} from '@/components/Selector'

;<ProForm
  initialValues={{ accountIds: ['user-demo-1'], roleIds: [], organizationIds: [], positionIds: [] }}
  onFinish={async (values) => {
    console.log(values)
  }}
>
  <ProFormItem name="accountIds" label="账号" rules={[{ required: true }]}>
    <GlobalAccountSelect multiple={false} request={searchAccounts} resolve={resolveAccounts} />
  </ProFormItem>
  <ProFormItem name="memberIds" label="成员">
    <OrganizationMemberSelect
      multiple
      candidateContextKey={candidateContextKey}
      scope={scope}
      request={searchMembers}
      resolve={resolveMembers}
    />
  </ProFormItem>
  <ProFormItem name="roleIds" label="角色">
    <RoleSelect roles={roles} onChange={(ids, records) => console.log(ids, records)} />
  </ProFormItem>
  <ProFormItem name="organizationIds" label="组织">
    <OrganizationSelect units={units} />
  </ProFormItem>
  <ProFormItem name="positionIds" label="岗位">
    <PositionSelect positions={positions} />
  </ProFormItem>
</ProForm>
```

候选、查询函数与作用域由业务提供。两种模式清空均为 `[]`。多选入口默认 `maxTagCount="responsive"`，弹窗中保持完整已选列表；`id`、`disabled`、`status`、`size`、样式等 Select 属性可直接传入。确认才回填，取消不改变表单；字段清空和移除立即更新。

组织职责开启示例及值：

```tsx
<ProFormItem name="organizationRelations" label="组织与职责">
  <OrganizationSelect units={units} enableDuties />
</ProFormItem>
// 默认关闭：['org-demo-1', 'org-demo-2']
// 开启：[{ organizationUnitId: 'org-demo-1', duty: 'leader' }]
```

角色的 `originalRoleIds` 可保留原有受限角色的撤销／恢复资格，`isRoleDisabled` 可注入业务禁选。岗位默认禁止新增停用项，可用 `isPositionDisabled` 注入完整业务规则，已选项始终允许移除。组织禁选与职责限制通过 `isOrganizationDisabled`／`isDutyDisabled` 注入。候选数组用于标签回显，缺失候选不会静默删除原 ID。

详细字段契约见[正式技术契约](../../../../../.spaces/01.企业级项目级/组织架构/技术契约.md#选择器表单字段契约2026-11-04)。

详细用法见各组件目录中的 README。查询函数均由业务侧注入，公共组件不决定接口地址、候选权限或数据保存方式。

[组织选择器用法](OrganizationSelector/README.md)支持通过 `enableDuties` 控制职责列，默认关闭。

根入口暂时保留原 `Selector` 默认导出及旧类型别名，实际均指向 `BasicTableSelector`；新代码应使用命名导出。
