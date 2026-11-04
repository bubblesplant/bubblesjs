// @vitest-environment happy-dom

import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { OrganizationRelationInput } from 'shared/types'
import {
  GlobalAccountSelect,
  OrganizationMemberSelect,
  OrganizationSelect,
  PositionSelect,
  RoleSelect,
} from '../../src/components/Selector'
import { createSelectorExampleData } from '../../src/pages/examples/selector/config/data'

vi.mock('@bubblesjs/i18n-react', () => ({ useI18n: () => ({ tr: (key: string) => key }) }))

type Change = (values: string[] | OrganizationRelationInput[], records: unknown[]) => void
interface Scenario {
  name: string
  ids: string[]
  records: unknown[]
  render: (value: string[], onChange: Change) => ReactNode
  values: (ids: string[]) => string[] | OrganizationRelationInput[]
}

const data = createSelectorExampleData('company')
const plainValues = (ids: string[]) => ids
/** 给已有组织分配不同职责，验证移除标签时职责不会重置。 */
const relations = (ids: string[]): OrganizationRelationInput[] =>
  ids.map((organizationUnitId) => ({
    organizationUnitId,
    duty: organizationUnitId === data.units[0]!.id ? 'leader' : 'deputy',
  }))
const sharedProps = { multiple: true, maxTagCount: 10 }
const scenarios: Scenario[] = [
  {
    name: '账号',
    ids: data.accounts.slice(0, 3).map((record) => record.userId),
    records: data.accounts.slice(0, 2),
    values: plainValues,
    render: (value, onChange) => (
      <GlobalAccountSelect
        {...sharedProps}
        value={value}
        selectedAccounts={data.accounts}
        request={async () => ({ items: [] })}
        resolve={async () => []}
        onChange={onChange}
      />
    ),
  },
  {
    name: '成员',
    ids: data.members.slice(0, 3).map((record) => record.userId),
    records: data.members.slice(0, 2),
    values: plainValues,
    render: (value, onChange) => (
      <OrganizationMemberSelect
        {...sharedProps}
        value={value}
        candidateContextKey="records-regression"
        scope={{ type: 'company', label: '虚构企业' }}
        selectedCandidates={data.members}
        request={async () => ({ items: [], total: 0 })}
        resolve={async () => []}
        onChange={onChange}
      />
    ),
  },
  {
    name: '角色',
    ids: data.roles.slice(0, 3).map((record) => record.id),
    records: data.roles.slice(0, 2),
    values: plainValues,
    render: (value, onChange) => (
      <RoleSelect {...sharedProps} value={value} roles={data.roles} onChange={onChange} />
    ),
  },
  {
    name: '纯组织',
    ids: data.units.slice(0, 3).map((record) => record.id),
    records: data.units.slice(0, 2),
    values: plainValues,
    render: (value, onChange) => (
      <OrganizationSelect {...sharedProps} value={value} units={data.units} onChange={onChange} />
    ),
  },
  {
    name: '职责组织',
    ids: data.units.slice(0, 3).map((record) => record.id),
    records: data.units.slice(0, 2),
    values: relations,
    render: (value, onChange) => (
      <OrganizationSelect
        {...sharedProps}
        enableDuties
        value={relations(value)}
        units={data.units}
        onChange={onChange}
      />
    ),
  },
  {
    name: '岗位',
    ids: data.positions.slice(0, 3).map((record) => record.id),
    records: data.positions.slice(0, 2),
    values: plainValues,
    render: (value, onChange) => (
      <PositionSelect
        {...sharedProps}
        value={value}
        positions={data.positions}
        onChange={onChange}
      />
    ),
  },
]

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
})

/** 挂载真实 Select，保留缺失 ID 和与候选数组不同的选择顺序。 */
function renderField(scenario: Scenario, onChange: Change, ids: string[]) {
  flushSync(() =>
    root.render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        {scenario.render(ids, onChange)}
      </ConfigProvider>,
    ),
  )
}

/** 派发原生鼠标操作，覆盖 AntD 标签删除与清空事件。 */
function click(element: HTMLElement | null) {
  expect(element).not.toBeNull()
  flushSync(() => {
    element!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    element!.click()
  })
}

describe('选择器真实字段的完整记录回调', () => {
  it.each(scenarios)(
    '$name：缺失记录保留 ID，移除与清空同序输出完整对象，外部赋值不回调',
    async (scenario) => {
      const onChange = vi.fn<Change>()
      const ids = ['missing-id', scenario.ids[2]!, scenario.ids[0]!, scenario.ids[1]!]
      renderField(scenario, onChange, ids)
      await vi.waitFor(() => expect(host.textContent).toContain('信息不可用'))
      expect(onChange).not.toHaveBeenCalled()
      const removals = host.querySelectorAll<HTMLElement>('.ant-select-selection-item-remove')
      click(removals[1]!)
      expect(onChange).toHaveBeenLastCalledWith(
        scenario.values(['missing-id', scenario.ids[0]!, scenario.ids[1]!]),
        scenario.records,
      )
      const records = onChange.mock.lastCall![1]
      expect(records[0]).toBe(scenario.records[0])
      expect(records[1]).toBe(scenario.records[1])
      click(host.querySelector<HTMLElement>('.ant-select-clear'))
      expect(onChange).toHaveBeenLastCalledWith([], [])
      onChange.mockClear()
      renderField(scenario, onChange, [scenario.ids[1]!])
      await vi.waitFor(() =>
        expect(host.querySelectorAll('.ant-select-selection-item')).toHaveLength(1),
      )
      expect(onChange).not.toHaveBeenCalled()
    },
  )
})
