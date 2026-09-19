import { ClearOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ProColumns } from '@ant-design/pro-components'
import { Alert, App, Button, Popconfirm, Space, Tabs, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CreateMenuRequest,
  FunctionCatalogResult,
  MenuNode,
  MenuTreeResult,
  ScopeType,
} from 'shared/types'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import { SvgAssetIcon } from '@/components/Icon/SvgAsset'
import CleanupDialog, { type CleanupDialogRef } from '../components/CleanupDialog'
import MenuFormDialog, { type MenuFormDialogRef } from '../components/MenuFormDialog'
import { useAccess, useManagementAction } from '../use-access'
import { menuApi } from './api'

interface MenuRow extends MenuNode {
  parentName: string
}

/** 管理各作用域的菜单树、功能绑定和废弃权限清理。 */
export default function MenusPage() {
  const access = useAccess()
  const { message } = App.useApp()
  const execute = useManagementAction()
  const [scopeType, setScopeType] = useState<ScopeType>('platform')
  const [tree, setTree] = useState<MenuTreeResult>()
  const [catalog, setCatalog] = useState<FunctionCatalogResult>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [refresh, setRefresh] = useState(0)
  const [filter, setFilter] = useState<{ query?: string; status?: string; type?: string }>({})
  const [previewing, setPreviewing] = useState(false)
  const formRef = useRef<MenuFormDialogRef>(null)
  const cleanupRef = useRef<CleanupDialogRef>(null)
  const { tr } = useI18n()
  const allowed = (action: string) => access.permissionKeys.includes(`platform.menus.${action}`)

  useEffect(
    /** 按作用域加载菜单树和功能目录，忽略已失效加载周期的结果。 */ () => {
      let current = true
      setLoading(true)
      setTree(undefined)
      setCatalog(undefined)
      setError(undefined)
      void Promise.all([menuApi.tree(scopeType), menuApi.catalog(scopeType)])
        .then(
          /** 仅提交当前加载周期的菜单树与功能目录，避免旧作用域覆盖新状态。 */ ([
            data,
            functions,
          ]) => {
            if (current) {
              setTree(data)
              setCatalog(functions)
            }
          },
        )
        .catch((cause: unknown) => {
          if (current && (cause as Error).name !== 'AbortError')
            setError(cause instanceof Error ? cause.message : tr('无法加载菜单'))
        })
        .finally(() => {
          if (current) setLoading(false)
        })
      return () => {
        current = false
      }
    },
    [scopeType, refresh],
  )

  const rows: MenuRow[] = []
  /** 递归展开菜单树，保留父级路径供表格搜索和展示。 */
  const append = (items: MenuNode[], parentName: string) => {
    for (const item of items) {
      rows.push({ ...item, children: [], parentName })
      append(item.children, `${parentName === tr('根目录') ? '' : `${parentName} / `}${item.name}`)
    }
  }
  append(tree?.items ?? [], tr('根目录'))
  const filteredRows = rows.filter(
    /** 按菜单名称或功能标识匹配关键字，并叠加状态及节点类型筛选。 */
    (row) =>
      (!filter.query ||
        `${row.name} ${row.routeKey ?? ''} ${row.permissionKey ?? ''}`
          .toLowerCase()
          .includes(filter.query.toLowerCase())) &&
      (!filter.status || row.status === filter.status) &&
      (!filter.type || row.type === filter.type),
  )

  /** 加载废弃权限清理预览，并展示请求失败信息。 */
  async function previewCleanup() {
    setPreviewing(true)
    try {
      cleanupRef.current?.show(await menuApi.cleanupPreview())
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError')
        void message.error(cause instanceof Error ? cause.message : tr('无法加载预览'))
    } finally {
      setPreviewing(false)
    }
  }

  const columns: ProColumns<MenuRow>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('名称或功能标识') },
    },
    {
      title: tr('名称'),
      dataIndex: 'name',
      search: false,
      width: 180,
      render: (_, record) => (
        <Space>
          <SvgAssetIcon name={record.icon} />
          {record.name}
          {record.protected && <Tag color="blue">{tr('保护')}</Tag>}
        </Space>
      ),
    },
    {
      title: tr('类型'),
      dataIndex: 'type',
      width: 100,
      valueEnum: {
        directory: tr('目录'),
        page: tr('页面'),
        operation: tr('按钮 / 操作'),
      },
    },
    { title: tr('父级'), dataIndex: 'parentName', search: false, ellipsis: true, width: 200 },
    {
      title: tr('绑定功能'),
      search: false,
      width: 240,
      render: (_, record) =>
        tr(catalog?.items.find((item) => item.key === record.permissionKey)?.title ?? '—'),
    },
    {
      title: tr('导航'),
      dataIndex: 'hidden',
      search: false,
      width: 80,
      render: (_, record) =>
        record.type === 'operation' ? '—' : record.hidden ? tr('隐藏') : tr('显示'),
    },
    {
      title: tr('状态'),
      dataIndex: 'status',
      width: 90,
      valueEnum: {
        active: { text: tr('启用'), status: 'Success' },
        disabled: { text: tr('停用'), status: 'Default' },
      },
    },
    { title: tr('排序'), dataIndex: 'sort', search: false, width: 70 },
    {
      title: tr('操作'),
      valueType: 'option',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          {allowed('update') && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                if (tree && catalog) formRef.current?.show({ record, tree, catalog })
              }}
            >
              {tr('编辑')}
            </Button>
          )}
          {allowed('delete') && !record.protected && (
            <Popconfirm
              title={tr('删除菜单节点？')}
              description={tr('仍有子节点或角色授权引用时不能删除。')}
              onConfirm={() =>
                execute(
                  () => menuApi.remove(record.id, tree!.version),
                  () => setRefresh((value) => value + 1),
                )
              }
            >
              <Button type="link" size="small" danger>
                {tr('删除')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="menu-management">
      <Tabs
        activeKey={scopeType}
        onChange={
          /** 切换菜单作用域前清除旧树和筛选条件，等待新作用域数据。 */ (key) => {
            setTree(undefined)
            setFilter({})
            setScopeType(key as ScopeType)
          }
        }
        items={[
          { key: 'platform', label: tr('平台菜单') },
          { key: 'company', label: tr('企业菜单') },
          { key: 'project', label: tr('项目菜单') },
        ]}
      />
      {error && (
        <Alert
          style={{ margin: '0 16px' }}
          type="error"
          showIcon
          title={error}
          action={<Button onClick={() => setRefresh((value) => value + 1)}>{tr('重试')}</Button>}
        />
      )}
      <div className="menu-table">
        <FullHeightProTable<MenuRow>
          key={scopeType}
          rowKey="id"
          columns={columns}
          dataSource={filteredRows}
          loading={loading}
          headerTitle={tr('菜单与操作')}
          options={{ reload: false }}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
          }}
          onSubmit={(values) => setFilter(values)}
          onReset={() => setFilter({})}
          toolBarRender={() =>
            [
              <Button
                key="refresh"
                icon={<ReloadOutlined />}
                onClick={() => setRefresh((value) => value + 1)}
              >
                {tr('刷新')}
              </Button>,
              allowed('cleanup') && access.administrator === 'platform' && (
                <Button
                  key="cleanup"
                  icon={<ClearOutlined />}
                  loading={previewing}
                  onClick={() => void previewCleanup()}
                >
                  {tr('清理废弃权限')}
                </Button>
              ),
              allowed('create') && (
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={!tree || !catalog}
                  onClick={() => {
                    if (tree && catalog) formRef.current?.show({ tree, catalog })
                  }}
                >
                  {tr('新增节点')}
                </Button>
              ),
            ].filter(Boolean)
          }
        />
      </div>
      <MenuFormDialog
        ref={formRef}
        onSave={(state, data) =>
          execute(
            () =>
              state.record
                ? menuApi.update(state.record.id, data)
                : menuApi.create(state.tree.scopeType, data as CreateMenuRequest),
            () => setRefresh((value) => value + 1),
          )
        }
      />
      <CleanupDialog
        ref={cleanupRef}
        onSave={(data) =>
          execute(
            () => menuApi.cleanup(data),
            () => setRefresh((value) => value + 1),
          )
        }
      />
    </div>
  )
}
