import { PlusOutlined, SwapOutlined } from '@ant-design/icons'
import { Button, Flex, Popconfirm, Space, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationUnitNode } from 'shared/types'
import type { BrowserSelection } from './OrganizationTreeModel'

interface OrganizationMemberHeaderProps {
  selection: BrowserSelection
  selectedUnit?: OrganizationUnitNode
  canCreate: boolean
  canUpdate: boolean
  canMove: boolean
  canAssign: boolean
  moving: boolean
  assigning: boolean
  onCreate: (parentId: string | null) => void
  onEdit: (unit: OrganizationUnitNode) => void
  onMove: (unit: OrganizationUnitNode) => void
  onAssign: (unit: OrganizationUnitNode) => void
  onToggleStatus: (unit: OrganizationUnitNode) => void
}

/** 展示当前组织浏览标题及其结构、成员和状态操作。 */
export default function OrganizationMemberHeader({
  selection,
  selectedUnit,
  canCreate,
  canUpdate,
  canMove,
  canAssign,
  moving,
  assigning,
  onCreate,
  onEdit,
  onMove,
  onAssign,
  onToggleStatus,
}: OrganizationMemberHeaderProps) {
  const { tr } = useI18n()

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={12}
      wrap
      style={{
        minHeight: 64,
        padding: '12px 20px',
        borderBottom: '1px solid rgba(120,100,196,.14)',
      }}
    >
      <div>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {selectedUnit
            ? selectedUnit.name
            : selection === 'unassigned'
              ? tr('未归属组织成员')
              : tr('全部成员')}
        </Typography.Title>
        {selectedUnit && (
          <Typography.Text type="secondary">{selectedUnit.fullPath}</Typography.Text>
        )}
      </div>
      <Space wrap>
        {canCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => onCreate(selectedUnit?.id ?? null)}
          >
            {selectedUnit ? tr('创建子级') : tr('创建顶级组织')}
          </Button>
        )}
        {selectedUnit && canUpdate && (
          <Button onClick={() => onEdit(selectedUnit)}>{tr('编辑')}</Button>
        )}
        {selectedUnit && canMove && (
          <Button icon={<SwapOutlined />} loading={moving} onClick={() => onMove(selectedUnit)}>
            {tr('移动')}
          </Button>
        )}
        {selectedUnit && canAssign && (
          <Button loading={assigning} onClick={() => onAssign(selectedUnit)}>
            {tr('分配成员')}
          </Button>
        )}
        {selectedUnit && canUpdate && (
          <Popconfirm
            title={selectedUnit.status === 'active' ? tr('停用组织单元？') : tr('恢复组织单元？')}
            description={tr('不会删除后代状态和成员关系。')}
            onConfirm={() => onToggleStatus(selectedUnit)}
          >
            <Button danger={selectedUnit.status === 'active'}>
              {selectedUnit.status === 'active' ? tr('停用') : tr('恢复')}
            </Button>
          </Popconfirm>
        )}
      </Space>
    </Flex>
  )
}
