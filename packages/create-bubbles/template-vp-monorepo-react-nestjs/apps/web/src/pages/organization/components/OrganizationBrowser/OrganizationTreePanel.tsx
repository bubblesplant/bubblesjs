import {
  ApartmentOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons'
import { Button, Card, Empty, Flex, Space, Spin, Tag, Tree } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationScope, OrganizationUnitRecord } from 'shared/types'
import type { BrowserSelection, OrganizationTreeNode } from './OrganizationTreeModel'

/** 展示组织树入口、全部成员和未归属成员快捷筛选。 */
export default function OrganizationTreePanel({
  scopeType,
  treeData,
  loading,
  selection,
  selectedUnit,
  onReload,
  onSelect,
  onLoadData,
}: {
  scopeType: OrganizationScope['type']
  treeData: OrganizationTreeNode[]
  loading: boolean
  selection: BrowserSelection
  selectedUnit?: OrganizationUnitRecord
  onReload: () => void
  onSelect: (selection: BrowserSelection) => void
  onLoadData: (node: OrganizationTreeNode) => Promise<void>
}) {
  const { tr } = useI18n()
  return (
    <Card
      className="h-full shrink-0 overflow-hidden"
      style={{ width: 330 }}
      title={
        <Space>
          <ApartmentOutlined />
          <span>{tr('组织架构')}</span>
          <Tag color="purple">{scopeType === 'company' ? tr('企业级') : tr('项目级')}</Tag>
        </Space>
      }
      extra={<Button type="text" icon={<ReloadOutlined />} onClick={onReload} />}
      styles={{ body: { height: 'calc(100% - 57px)', overflow: 'auto', padding: 12 } }}
    >
      <Flex vertical gap={6}>
        <Button
          type={selection === 'all' ? 'primary' : 'text'}
          icon={<TeamOutlined />}
          block
          style={{ textAlign: 'left' }}
          onClick={() => onSelect('all')}
        >
          {tr('全部成员')}
        </Button>
        <Button
          type={selection === 'unassigned' ? 'primary' : 'text'}
          icon={<UserDeleteOutlined />}
          block
          style={{ textAlign: 'left' }}
          onClick={() => onSelect('unassigned')}
        >
          {tr('未归属组织')}
        </Button>
        <div style={{ borderTop: '1px solid rgba(120,100,196,.18)', margin: '6px 0' }} />
        {loading ? (
          <Flex justify="center" style={{ padding: 32 }}>
            <Spin />
          </Flex>
        ) : treeData.length ? (
          <Tree<OrganizationTreeNode>
            blockNode
            treeData={treeData}
            selectedKeys={selectedUnit ? [selectedUnit.id] : []}
            loadData={onLoadData}
            onSelect={(keys) => {
              const key = keys[0]
              if (typeof key === 'string') onSelect(key)
            }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr('暂无组织单元')} />
        )}
      </Flex>
    </Card>
  )
}
