import {
  ModalForm,
  ProForm,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
} from '@ant-design/pro-components'
import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CreateMenuRequest,
  FunctionCatalogResult,
  MenuNode,
  MenuTreeResult,
  UpdateMenuRequest,
} from 'shared/types'
import { IconSelector } from '@/components/Icon/SvgAsset'

interface EditorState {
  record?: MenuNode
  tree: MenuTreeResult
  catalog: FunctionCatalogResult
}
export interface MenuFormDialogRef {
  show: (state: EditorState) => void
  hide: () => void
}

/** 编辑菜单结构与功能绑定，限制循环父级及重复绑定。 */
export default function MenuFormDialog({
  ref,
  onSave,
}: {
  ref: Ref<MenuFormDialogRef>
  onSave: (state: EditorState, data: CreateMenuRequest | UpdateMenuRequest) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<EditorState>()
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 载入菜单树、功能目录及可选编辑节点，打开菜单表单。 */
    show: (value) => {
      setState(value)
      setOpen(true)
    },
    hide,
  }))
  const nodes: MenuNode[] = []
  /** 递归展开菜单树，供父级节点和已绑定功能的筛选使用。 */
  const append = (items: MenuNode[]) => {
    for (const node of items) {
      nodes.push(node)
      append(node.children)
    }
  }
  append(state?.tree.items ?? [])
  const record = state?.record
  const descendants = new Set<string>()
  /** 收集当前节点及全部后代，避免菜单编辑时选择自身后代作为父级。 */
  const mark = (node?: MenuNode) => {
    if (!node) return
    descendants.add(node.id)
    node.children.forEach(mark)
  }
  mark(nodes.find((node) => node.id === record?.id))
  const pages =
    state?.catalog.items.filter((item) => item.kind === 'page' && !item.deprecated) ?? []
  const boundPages = new Set(
    nodes.filter((item) => item.type === 'page').map((item) => item.routeKey),
  )
  const boundOperations = new Set(
    nodes.filter((item) => item.type === 'operation').map((item) => item.permissionKey),
  )

  return (
    <ModalForm<CreateMenuRequest>
      title={record ? tr('编辑菜单节点') : tr('新增菜单节点')}
      open={open}
      width={620}
      initialValues={
        record ?? { type: 'page', parentId: null, sort: 0, hidden: false, status: 'active' }
      }
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存菜单') } }}
      onFinish={
        /** 规范化菜单字段并携带树版本提交新增或编辑，成功后关闭弹窗。 */ async (values) => {
          if (!state) return false
          const common: UpdateMenuRequest = {
            expectedVersion: state.tree.version,
            name: values.name.trim(),
            parentId: values.parentId ?? null,
            // 新建页面未选择图标时省略字段，让服务端按页面目录补默认图标；编辑时保留空值以支持显式清空。
            icon: record ? (values.icon ?? '') : values.icon || undefined,
            sort: values.sort ?? 0,
            hidden: values.hidden ?? false,
            status: values.status ?? 'active',
          }
          const data = record
            ? common
            : {
                ...common,
                name: values.name.trim(),
                parentId: values.parentId ?? null,
                type: values.type,
                ...(values.type === 'page'
                  ? { routeKey: values.routeKey }
                  : values.type === 'operation'
                    ? { permissionKey: values.permissionKey }
                    : {}),
              }
          const ok = await onSave(state, data)
          if (ok) hide()
          return ok
        }
      }
    >
      {record?.protected && (
        <Alert
          type="info"
          showIcon
          title={tr('此节点属于受保护的管理入口，不能隐藏、停用或移到不可用位置。')}
          style={{ marginBottom: 18 }}
        />
      )}
      {!record && (
        <ProFormSelect
          name="type"
          label={tr('节点类型')}
          options={[
            { value: 'directory', label: tr('目录') },
            { value: 'page', label: tr('页面') },
            { value: 'operation', label: tr('按钮 / 操作') },
          ]}
          rules={[{ required: true }]}
        />
      )}
      <ProFormText
        name="name"
        label={tr('显示名称')}
        fieldProps={{ maxLength: 100 }}
        rules={[{ required: true, whitespace: true, max: 100, message: tr('请输入显示名称') }]}
      />
      <ProFormDependency name={['type', 'parentId']}>
        {
          /** 按节点类型筛选合法父级及尚未绑定的页面或操作，渲染联动字段。 */ ({
            type,
            parentId,
          }) => {
            const nodeType = record?.type ?? type
            const parent = nodes.find((node) => node.id === parentId)
            const availableParents = nodes.filter(
              (node) =>
                !descendants.has(node.id) &&
                (nodeType === 'operation'
                  ? node.type === 'page' && (!record || node.routeKey === record.routeKey)
                  : node.type === 'directory'),
            )
            return (
              <>
                <ProFormSelect
                  name="parentId"
                  label={tr('父级节点')}
                  allowClear={nodeType !== 'operation'}
                  placeholder={
                    nodeType === 'operation' ? tr('选择所属页面') : tr('不选择，放在根目录')
                  }
                  rules={
                    nodeType === 'operation'
                      ? [{ required: true, message: tr('操作必须属于一个页面') }]
                      : []
                  }
                  options={availableParents.map((node) => ({ value: node.id, label: node.name }))}
                />
                {!record && nodeType === 'page' && (
                  <ProFormSelect
                    name="routeKey"
                    label={tr('绑定页面')}
                    placeholder={tr('选择已发布的页面')}
                    rules={[{ required: true, message: tr('请选择页面') }]}
                    options={pages
                      .filter((item) => !boundPages.has(item.routeKey))
                      .map((item) => ({ value: item.routeKey, label: tr(item.title) }))}
                  />
                )}
                {!record && nodeType === 'operation' && (
                  <ProFormSelect
                    name="permissionKey"
                    label={tr('绑定操作')}
                    placeholder={tr('先选择所属页面')}
                    rules={[{ required: true, message: tr('请选择操作') }]}
                    options={(state?.catalog.items ?? [])
                      .filter(
                        (item) =>
                          item.kind === 'operation' &&
                          !item.deprecated &&
                          item.routeKey === parent?.routeKey &&
                          !boundOperations.has(item.key),
                      )
                      .map((item) => ({ value: item.key, label: tr(item.title) }))}
                  />
                )}
                {record && record.type !== 'directory' && (
                  <p>
                    {tr('已绑定：')}
                    {tr(
                      state?.catalog.items.find((item) => item.key === record.permissionKey)
                        ?.title ?? record.name,
                    )}
                    {tr('。已有节点不能更换绑定功能。')}
                  </p>
                )}
              </>
            )
          }
        }
      </ProFormDependency>
      <ProForm.Item name="icon" label={tr('图标')}>
        <IconSelector placeholder={tr('搜索并选择图标')} />
      </ProForm.Item>
      <ProFormDigit
        name="sort"
        label={tr('排序')}
        min={0}
        max={100000}
        fieldProps={{ precision: 0 }}
      />
      <ProFormSwitch
        name="hidden"
        label={tr('隐藏导航')}
        disabled={record?.protected}
        extra={tr('隐藏只影响菜单展示，已授权用户仍可直接访问。')}
      />
      <ProFormSelect
        name="status"
        label={tr('功能状态')}
        disabled={record?.protected}
        options={[
          { value: 'active', label: tr('启用') },
          { value: 'disabled', label: tr('停用') },
        ]}
        extra={tr('停用会阻断节点及下级功能，管理员也受此限制。')}
      />
    </ModalForm>
  )
}
