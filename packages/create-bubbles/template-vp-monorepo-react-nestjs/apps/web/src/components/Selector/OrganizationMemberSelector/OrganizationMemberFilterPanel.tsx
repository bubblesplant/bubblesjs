import {
  ApartmentOutlined,
  BankOutlined,
  ClearOutlined,
  IdcardOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Button, Flex, Select, Spin, Switch, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  OrganizationMemberBrowserScope,
  OrganizationMemberFilterOption,
  OrganizationMemberResourceFilters,
} from './OrganizationMemberSelectorTypes'

/** 左侧浏览面板当前提交给候选查询的筛选值。 */
export interface OrganizationMemberFilterValue {
  projectIds: string[]
  organizationUnitIds: string[]
  positionIds: string[]
  roleIds: string[]
  unassigned: boolean
}

/** 创建互不共享数组引用的空筛选值。 */
export function createEmptyOrganizationMemberFilterValue(): OrganizationMemberFilterValue {
  return {
    projectIds: [],
    organizationUnitIds: [],
    positionIds: [],
    roleIds: [],
    unassigned: false,
  }
}

/** 渲染左侧单类多选入口，空列表仍明确展示当前没有可见项。 */
function FilterSelect({
  icon,
  label,
  emptyText,
  options,
  value,
  onChange,
}: {
  icon: ReactNode
  label: string
  emptyText: string
  options: readonly OrganizationMemberFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <Flex vertical gap={6}>
      <Flex align="center" gap={6}>
        {icon}
        <Typography.Text strong>{label}</Typography.Text>
      </Flex>
      <Select
        mode="multiple"
        value={value}
        options={[...options]}
        disabled={!options.length}
        placeholder={options.length ? label : emptyText}
        maxTagCount="responsive"
        optionFilterProp="label"
        popupMatchSelectWidth={320}
        onChange={onChange}
      />
    </Flex>
  )
}

/** 以作用域为第一层，提供组织、岗位和权限角色的左侧筛选轨道。 */
export default function OrganizationMemberFilterPanel({
  scope,
  projects,
  resourceFilters,
  loading,
  value,
  onChange,
}: {
  scope: OrganizationMemberBrowserScope
  projects?: readonly OrganizationMemberFilterOption[]
  resourceFilters?: OrganizationMemberResourceFilters
  loading?: boolean
  value: OrganizationMemberFilterValue
  onChange: (value: OrganizationMemberFilterValue) => void
}) {
  const { tr } = useI18n()
  const currentScopeLabel =
    scope.label ?? (scope.type === 'company' ? tr('当前企业') : tr('当前项目'))
  const changeProjects = (projectIds: string[]) => {
    onChange({ ...createEmptyOrganizationMemberFilterValue(), projectIds })
  }

  return (
    <Flex
      vertical
      gap={16}
      style={{
        flex: '0 0 252px',
        width: 252,
        minHeight: 472,
        padding: 16,
        border: '1px solid rgba(113, 83, 184, .18)',
        borderRadius: 12,
        background:
          'linear-gradient(180deg, rgba(118, 87, 190, .085) 0%, rgba(118, 87, 190, .025) 100%)',
      }}
    >
      <Flex align="center" justify="space-between" gap={8}>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {tr('浏览范围')}
          </Typography.Text>
          <Typography.Title level={5} style={{ margin: '2px 0 0' }}>
            {tr('按组织定位人员')}
          </Typography.Title>
        </div>
        <Button
          type="text"
          aria-label={tr('清除筛选')}
          icon={<ClearOutlined />}
          disabled={
            !value.projectIds.length &&
            !value.organizationUnitIds.length &&
            !value.positionIds.length &&
            !value.roleIds.length &&
            !value.unassigned
          }
          onClick={() => onChange(createEmptyOrganizationMemberFilterValue())}
        />
      </Flex>

      <Flex vertical gap={8}>
        <Typography.Text strong>{tr('作用范围')}</Typography.Text>
        <Button
          type={!value.projectIds.length ? 'primary' : 'default'}
          icon={<BankOutlined />}
          block
          style={{ textAlign: 'left' }}
          onClick={() => changeProjects([])}
        >
          {currentScopeLabel}
        </Button>
        {scope.type === 'company' && projects !== undefined && (
          <Select
            mode="multiple"
            value={value.projectIds}
            options={[...projects]}
            disabled={!projects.length}
            prefix={<ProjectOutlined />}
            placeholder={projects.length ? tr('选择可见项目') : tr('暂无可见项目')}
            maxTagCount="responsive"
            optionFilterProp="label"
            popupMatchSelectWidth={320}
            onChange={changeProjects}
          />
        )}
      </Flex>

      <Spin spinning={loading} size="small">
        <Flex vertical gap={14}>
          {resourceFilters?.organizationUnits !== undefined && (
            <FilterSelect
              icon={<ApartmentOutlined />}
              label={tr('组织架构')}
              emptyText={tr('暂无可见组织')}
              options={resourceFilters.organizationUnits}
              value={value.organizationUnitIds}
              onChange={(organizationUnitIds) => onChange({ ...value, organizationUnitIds })}
            />
          )}
          {resourceFilters?.positions !== undefined && (
            <FilterSelect
              icon={<IdcardOutlined />}
              label={tr('岗位')}
              emptyText={tr('暂无可见岗位')}
              options={resourceFilters.positions}
              value={value.positionIds}
              onChange={(positionIds) => onChange({ ...value, positionIds })}
            />
          )}
          {resourceFilters?.roles !== undefined && (
            <FilterSelect
              icon={<SafetyCertificateOutlined />}
              label={tr('权限角色')}
              emptyText={tr('暂无可见角色')}
              options={resourceFilters.roles}
              value={value.roleIds}
              onChange={(roleIds) => onChange({ ...value, roleIds })}
            />
          )}
          {resourceFilters?.allowUnassigned && (
            <Flex align="center" justify="space-between" gap={12}>
              <Typography.Text>{tr('只看未归属组织')}</Typography.Text>
              <Switch
                size="small"
                checked={value.unassigned}
                onChange={(unassigned) => onChange({ ...value, unassigned })}
              />
            </Flex>
          )}
        </Flex>
      </Spin>
    </Flex>
  )
}
