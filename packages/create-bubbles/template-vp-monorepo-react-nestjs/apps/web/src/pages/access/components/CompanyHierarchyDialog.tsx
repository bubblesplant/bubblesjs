import { ApartmentOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Empty,
  Flex,
  Form,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Tree,
  Typography,
} from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CompanyEntityType,
  CompanyHierarchyNode,
  UpdateCompanyHierarchyRequest,
} from 'shared/types'

const ROOT_VALUE = '__company_root__'

interface HierarchyFormValues {
  parentCompanyId: string
  entityType: CompanyEntityType
  sort: number
}

export interface CompanyHierarchyDialogRef {
  show: () => void
  hide: () => void
}

/** 将企业层级转换为树组件数据。 */
function hierarchyTreeData(nodes: CompanyHierarchyNode[]): Array<{
  key: string
  title: ReactNode
  children: ReturnType<typeof hierarchyTreeData>
}> {
  return nodes.map((node) => ({
    key: node.id,
    title: (
      <Space size={6}>
        <span>{node.name}</span>
        {node.entityType === 'group' && <Tag color="purple">集团</Tag>}
        {node.status === 'disabled' && <Tag>停用</Tag>}
      </Space>
    ),
    children: hierarchyTreeData(node.children),
  }))
}

/** 将企业树压平成带层级语义的父级选项。 */
function hierarchyOptions(
  nodes: CompanyHierarchyNode[],
  depth = 0,
): Array<{ value: string; label: string }> {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}` },
    ...hierarchyOptions(node.children, depth + 1),
  ])
}

/** 在企业层级树中按 id 查找当前节点。 */
function findCompany(nodes: CompanyHierarchyNode[], id: string): CompanyHierarchyNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findCompany(node.children, id)
    if (child) return child
  }
  return undefined
}

/** 查看平台可见企业树并编辑父企业、实体类型与同级排序。 */
export default function CompanyHierarchyDialog({
  ref,
  loadTree,
  onSave,
}: {
  ref: Ref<CompanyHierarchyDialogRef>
  loadTree: () => Promise<CompanyHierarchyNode[]>
  onSave: (record: CompanyHierarchyNode, values: UpdateCompanyHierarchyRequest) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tree, setTree] = useState<CompanyHierarchyNode[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [form] = Form.useForm<HierarchyFormValues>()
  const { message } = App.useApp()
  const { tr } = useI18n()
  const selected = selectedId ? findCompany(tree, selectedId) : undefined

  /** 重新读取可见企业层级，避免保存后继续展示旧父子关系。 */
  const reload = async () => {
    setLoading(true)
    try {
      setTree(await loadTree())
    } catch (error) {
      setTree([])
      void message.error(error instanceof Error ? error.message : tr('无法加载企业层级'))
    } finally {
      setLoading(false)
    }
  }

  const hide = () => {
    if (!saving) setOpen(false)
  }
  useImperativeHandle(ref, () => ({
    /** 打开企业层级编辑器并立即读取最新树。 */
    show: () => {
      setSelectedId(undefined)
      setOpen(true)
      void reload()
    },
    hide,
  }))

  return (
    <Modal
      title={
        <Space>
          <ApartmentOutlined />
          <span>{tr('企业层级')}</span>
        </Space>
      }
      open={open}
      width={920}
      destroyOnHidden
      okText={tr('保存层级')}
      okButtonProps={{ disabled: !selected }}
      confirmLoading={saving}
      onCancel={hide}
      onOk={
        /** 校验表单并携带节点当前版本更新层级。 */ async () => {
          if (!selected) return
          const values = await form.validateFields()
          setSaving(true)
          try {
            const ok = await onSave(selected, {
              parentCompanyId:
                values.parentCompanyId === ROOT_VALUE ? null : values.parentCompanyId,
              entityType: values.entityType,
              sort: values.sort,
              expectedVersion: selected.version,
            })
            if (ok) {
              setSelectedId(undefined)
              form.resetFields()
              await reload()
            }
          } finally {
            setSaving(false)
          }
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('企业层级只影响导航和选择范围')}
        description={tr(
          '调整父企业不会迁移成员、项目、角色或业务数据。循环和越权目标由服务端拒绝。',
        )}
        style={{ marginBottom: 16 }}
      />
      <Flex gap={20} align="stretch" style={{ minHeight: 430 }}>
        <div
          style={{ width: 360, borderRight: '1px solid rgba(120,100,196,.16)', paddingRight: 16 }}
        >
          {loading ? (
            <Flex justify="center" align="center" style={{ height: 360 }}>
              <Spin />
            </Flex>
          ) : tree.length ? (
            <Tree
              blockNode
              defaultExpandAll
              treeData={hierarchyTreeData(tree)}
              selectedKeys={selectedId ? [selectedId] : []}
              onSelect={(keys) => {
                const id = keys[0]
                if (typeof id !== 'string') return
                const record = findCompany(tree, id)
                if (!record) return
                setSelectedId(id)
                form.setFieldsValue({
                  parentCompanyId: record.parentCompanyId ?? ROOT_VALUE,
                  entityType: record.entityType,
                  sort: record.sort,
                })
              }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr('暂无可见企业')} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          {selected ? (
            <>
              <Typography.Title level={5}>{selected.name}</Typography.Title>
              <Form form={form} layout="vertical">
                <Form.Item
                  name="parentCompanyId"
                  label={tr('上级企业 / 集团')}
                  rules={[{ required: true }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={[
                      { value: ROOT_VALUE, label: tr('根级') },
                      ...hierarchyOptions(tree).filter((option) => option.value !== selected.id),
                    ]}
                  />
                </Form.Item>
                <Form.Item name="entityType" label={tr('实体类型')} rules={[{ required: true }]}>
                  <Radio.Group
                    options={[
                      { value: 'group', label: tr('集团') },
                      { value: 'company', label: tr('企业') },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="sort" label={tr('同级排序')} rules={[{ required: true }]}>
                  <InputNumber min={0} max={999999999} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </Form>
            </>
          ) : (
            <Flex justify="center" align="center" style={{ height: '100%' }}>
              <Typography.Text type="secondary">{tr('从左侧选择一个企业进行编辑')}</Typography.Text>
            </Flex>
          )}
        </div>
      </Flex>
    </Modal>
  )
}
