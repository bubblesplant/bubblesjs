import { Space, Tag } from 'antd'
import type { OrganizationUnitNode } from 'shared/types'

/** 组织浏览器当前选中的保留分组键或组织单元 ID。 */
export type BrowserSelection = string

export interface OrganizationTreeNode {
  key: string
  title: ReactNode
  isLeaf: boolean
  unit: OrganizationUnitNode
  children?: OrganizationTreeNode[]
}

/** 将服务端单层组织记录转换为 Ant Design 懒加载树节点。 */
export function toTreeNodes(
  units: OrganizationUnitNode[],
  disabledLabel: string,
): OrganizationTreeNode[] {
  return units.map((unit) => ({
    key: unit.id,
    title: (
      <Space size={6}>
        <span>{unit.name}</span>
        {!unit.effective && <Tag color="default">{disabledLabel}</Tag>}
      </Space>
    ),
    isLeaf: !unit.hasChildren,
    unit,
  }))
}

/** 不改变其他分支引用地替换指定父节点的直接子节点。 */
export function replaceChildren(
  nodes: OrganizationTreeNode[],
  parentId: string,
  children: OrganizationTreeNode[],
): OrganizationTreeNode[] {
  return nodes.map((node) =>
    node.key === parentId
      ? { ...node, children }
      : node.children
        ? { ...node, children: replaceChildren(node.children, parentId, children) }
        : node,
  )
}

/** 在已加载树中按 key 查找组织节点。 */
export function findTreeNode(
  nodes: OrganizationTreeNode[],
  key: string,
): OrganizationTreeNode | undefined {
  for (const node of nodes) {
    if (node.key === key) return node
    const nested = node.children ? findTreeNode(node.children, key) : undefined
    if (nested) return nested
  }
  return undefined
}
