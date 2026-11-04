# BasicTableSelector

与业务无关的表格选择弹窗，基于 ProTable。调用方提供标题、查询函数、稳定的 `rowKey` 和表格配置。默认单选，`multiple` 开启跨页多选。

桌面端左侧查询及分页表格，右侧 280px 浅紫已选容器始终占位；数量和清空固定在顶部，已选列表使用 `overflow: auto`，选择、移除和清空不会撑高弹窗或改变表格位置。白色胶囊标签按内容宽度从左到右连续排列，空间不足自动换行；长标签限制在容器内并允许文字换行。窄屏上下排列且已选容器固定高度。可选 `sidePanel` 仍展示在查询区域左侧。交互依据见[选择器布局需求](../../../../../../.spaces/01.企业级项目级/权限与菜单/需求文档.md#账号与角色选择器布局)。

默认按钮文案为“确定选择”；多选时底部显示“支持跨页选择”。账号和成员使用 `SelectedPersonLabel` 复用首字头像与完整账号提示。视觉依据为[已确认设计](../../../../../../.spaces/01.企业级项目级/权限与菜单/ui/selector-layout/README.md)。

## 接口

| 参数                       | 说明                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `ref`                      | 通过 `show({ value, selectedRows })` 打开，通过 `hide()` 关闭                                |
| `title`                    | 弹窗标题                                                                                     |
| `description`              | 标题下的浏览提示，不参与弹窗可访问名称                                                       |
| `selectionTitle`           | 已选区领域标题，默认“已选项目”，数量使用独立徽标                                             |
| `emptyDescription`         | 空选择引导，默认“从左侧选择项目”                                                             |
| `rowKey`                   | 唯一字段名或 `(record) => key`，禁止使用分页内的行索引                                       |
| `request`                  | ProTable 原生查询函数，返回 `{ data, total, success }`                                       |
| `multiple`                 | 默认 `false`，单选与多选的输入输出均为数组                                                   |
| `onChange(keys, rows)`     | 点击确定后调用；两个数组长度与顺序一致。可返回 Promise，失败时保留弹窗和选择                 |
| `requestByKeys(keys)`      | 可选，确定时补查缺失的已选对象；只请求缺失 key，结果顺序不限                                 |
| `labelRender(record)`      | 已选标签的展示内容，默认显示 key                                                             |
| `getCheckboxProps(record)` | 设置候选行是否禁选等属性                                                                     |
| `onTableChange`            | ProTable 原生的分页、排序、筛选回调                                                          |
| `modalProps`               | 弹窗宽度、居中、按钮文案、样式等配置                                                         |
| 其他参数                   | 直接透传 `columns`、`params`、`pagination`、`search`、`scroll`、`actionRef` 等 ProTable 配置 |

`show()` 的 `value` 为 key 数组，省略时从空选择开始；`selectedRows` 为这些 key 对应的对象，可选。多选支持跨分页、跨搜索保留选择，表头全选仅针对当前页。已选标签可以移除不在当前页的项，也可以清空全部。

勾选仅修改弹窗内的临时选择，取消、关闭不会调用 `onChange`。空选择确认返回 `([], [])`，是否必选由业务表单校验。单选传入两个以上不同 key 会报错。

## 使用

```tsx
import { Button } from 'antd'
import {
  BasicTableSelector,
  type BasicTableSelectorRef,
} from '@/components/Selector'

interface Item {
  id: string
  name: string
}

const selectorRef = useRef<BasicTableSelectorRef<Item>>(null)
const [keys, setKeys] = useState<Key[]>([])
const [selectedRows, setSelectedRows] = useState<Item[]>([])

<Button onClick={() => selectorRef.current?.show({ value: keys, selectedRows })}>
  选择条目
</Button>
<BasicTableSelector<Item>
  ref={selectorRef}
  title="选择条目"
  rowKey="id"
  multiple
  columns={[{ title: '名称', dataIndex: 'name' }]}
  request={async (params, sort, filter) => {
    const result = await queryItems({ params, sort, filter })
    return { data: result.items, total: result.total, success: true }
  }}
  requestByKeys={queryItemsByKeys}
  labelRender={(item) => item.name}
  onChange={(nextKeys, nextRows) => {
    setKeys(nextKeys)
    setSelectedRows(nextRows)
  }}
/>
```

示例中的 `queryItems`、`queryItemsByKeys` 由业务侧提供。组件不拼接接口地址、不决定业务权限、不创建或保存业务数据。请求参数通过 `params` 提供；ProTable 原生 `request` 同时接收分页、搜索、排序与筛选参数。

仅有 key 时，分页查询无法保证取得所有已选对象。再次打开优先传入已有 `selectedRows`；若只有 key，则提供 `requestByKeys`。当前页加载到的已选对象也可用于补全。没有对象的标签先展示 key，确定时补查；未查全或补查失败均不回调、不静默删项，用户可以重试或移除无效选择。

每次打开创建独立会话，取消后不保留本轮勾选和对象缓存。外部数据变化不会自动覆盖已经打开的临时选择，需要时重新调用 `show()`。关闭或重开后，旧会话的迟到请求不能提交选择或关闭新弹窗。

## 已选数据还要在业务表格中编辑

选择器管理“选了哪些对象”，业务表格管理“这些行被编辑成什么内容”。选择结果不代表覆盖业务表格的指令。重新选择时按稳定 key 合并：保留仍被选中行的当前数据，只为新增项初始化字段，移除取消选择的项。

```tsx
interface DetailRow extends Item {
  quantity: number
  remark: string
}

const [details, setDetails] = useState<DetailRow[]>([])

// 再次打开时，传入业务表格的当前数据。
selectorRef.current?.show({
  value: details.map((row) => row.id),
  selectedRows: details,
})

// 作为 BasicTableSelector 的 onChange。函数式更新取得最新编辑结果。
const handleSelectionChange = (_keys: Key[], selected: Item[]) => {
  setDetails((current) => {
    const existing = new Map(current.map((row) => [row.id, row]))
    return selected.map(
      (item) =>
        existing.get(item.id) ?? {
          ...item,
          quantity: 1,
          remark: '',
        },
    )
  })
}
```

这里采用一次 Map 查询完成合并，时间复杂度为 O(n + m)，不需要深比较整个对象，也不需要额外维护一份可能不同步的 keys 状态。已有行的所有字段及对象引用保持原样；如需刷新某些服务端字段，由业务明确指定合并规则。

在同一次弹窗内取消再选回，已有编辑仍可保留。确认移除后，将来再次添加默认视为新行；如果需要“删除后再选回来也恢复编辑”，可由业务另存以 key 索引的草稿 Map。更复杂的表单可将 `selectedKeys` 与 `draftByKey` 分开保存，但一般表格使用上述合并即可。

基础组件不返回业务增删改指令，也不负责保存草稿、校验权限或处理服务端版本冲突。
