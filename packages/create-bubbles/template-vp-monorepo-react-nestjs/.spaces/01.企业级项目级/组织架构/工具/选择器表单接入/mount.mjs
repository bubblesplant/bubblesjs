/** 在浏览器中挂载真实表单与公共选择器，仅使用虚构候选，不访问业务 API。 */
export async function mount() {
  const source = await (
    await fetch('/src/components/Selector/GlobalAccountSelect/GlobalAccountSelect.tsx')
  ).text()
  const i18nUrl = source.match(/import \{ useI18n \} from "([^"]+)"/)[1]
  const [react, dom, i18n, store, selectors, antd, pro, css, theme, locale] = await Promise.all([
    import('/@id/react'),
    import('/@id/react-dom/client'),
    import(i18nUrl),
    import('/src/i18n/index.ts'),
    import('/src/components/Selector/index.ts'),
    import('/@id/antd'),
    import('/@id/@ant-design/pro-components'),
    import('/@id/@ant-design/cssinjs'),
    import('/src/config/theme.ts'),
    import('/src/i18n/ui-locale.ts'),
    import('/src/styles/index.css'),
    import('/src/styles/dream.css'),
  ])
  const React = react.default
  const h = React.createElement
  const units = Array.from({ length: 36 }, (_, i) => ({
    id: `org-${i + 1}`,
    name: `演示组织${i + 1}`,
    fullPath:
      ['演示企业 / 研发中心', '演示企业 / 产品中心', '演示企业 / 设计中心'][i] ??
      `演示企业 / 协作组${i + 1}`,
    effective: i !== 35,
  }))
  const positions = Array.from({ length: 36 }, (_, i) => ({
    id: `pos-${i + 1}`,
    name: ['前端工程师', '产品经理', '交互设计师'][i] ?? `协作岗位${i + 1}`,
    code: `DEMO-${i + 1}`,
    status: i === 35 ? 'disabled' : 'active',
  }))
  const roles = Array.from({ length: 24 }, (_, i) => ({
    id: `role-${i + 1}`,
    name: ['项目协作员', '业务审核员', '历史受限角色', '禁止新增角色'][i] ?? `演示角色${i + 1}`,
    builtin: i === 0 ? 'member' : null,
    assignable: i !== 2 && i !== 3,
    description: '用于表单验证的虚构角色',
  }))
  const accounts = Array.from({ length: 6 }, (_, i) => ({
    userId: `user-${i + 1}`,
    name: ['演示成员甲', '演示成员乙', '演示成员丙'][i] ?? `演示成员${i + 1}`,
    account: `demo.${i + 1}@example.invalid`,
    disabled: i === 5,
  }))
  const members = accounts.map((account) => ({
    ...account,
    identities: [
      {
        memberId: `member-${account.userId}`,
        scopeName: '演示企业',
        organizationUnits: [],
        positions: [],
        roles: [],
      },
    ],
  }))
  const initial = {
    accountId: 'user-1',
    memberIds: ['user-1'],
    memberId: 'user-1',
    roleIds: ['role-1', 'role-3'],
    organizationIds: ['org-1'],
    organizationRelations: [{ organizationUnitId: 'org-1', duty: 'leader' }],
    positionIds: ['pos-1'],
    otherOrganizationIds: ['org-3'],
  }
  const qa = {
    units,
    positions,
    roles,
    accounts,
    members,
    initial,
    submissions: [],
    queries: [],
    changes: [],
  }
  window.__formQA = qa
  /** 只对虚构候选进行本地搜索分页，保留真实字段的请求及补查调用链。 */
  function search(rows, input) {
    qa.queries.push({ query: input.query, page: input.page })
    const filtered = rows.filter((row) => `${row.name} ${row.account}`.includes(input.query ?? ''))
    return Promise.resolve({
      items: filtered.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
      total: filtered.length,
    })
  }
  const accountRequest = (input) => search(accounts, input)
  const memberRequest = (input) => search(members, input)
  const accountResolve = async (ids) => accounts.filter((row) => ids.includes(row.userId))
  const memberResolve = async (ids) => members.filter((row) => ids.includes(row.userId))
  /** 使用 ProFormItem 原生注入的 value/onChange，不添加任何值转换适配。 */
  function Demo() {
    const [form] = antd.Form.useForm()
    const [disabled, setDisabled] = React.useState(false)
    const [output, setOutput] = React.useState(initial)
    const [loaded, setLoaded] = React.useState(true)
    qa.form = form
    qa.setDisabled = setDisabled
    qa.setLoaded = setLoaded
    qa.setOutput = setOutput
    const field = (name, label, component, extra = {}) =>
      h(
        pro.ProFormItem,
        {
          key: name,
          name,
          label,
          rules: [{ required: true, message: `请选择${label}` }],
          ...extra,
        },
        component,
      )
    const memberProps = {
      candidateContextKey: 'demo-company:form',
      scope: { type: 'company' },
      request: memberRequest,
      resolve: memberResolve,
      disabled,
    }
    return h(
      'div',
      { style: { maxWidth: 1120, padding: '28px 24px', margin: 'auto' } },
      h('h1', { style: { margin: '0 0 8px', fontSize: 26 } }, '统一表单选择器'),
      h(
        'p',
        { style: { color: '#7b8190', marginBottom: 24 } },
        '账号、成员、角色、组织、岗位 · 确认后回填 · 多选内容单行收纳',
      ),
      h(
        pro.ProForm,
        {
          form,
          name: 'selector-demo',
          initialValues: initial,
          layout: 'vertical',
          onValuesChange: (changed, values) => {
            qa.changes.push(changed)
            setOutput(values)
          },
          onFinish: async (values) => {
            qa.submissions.push(values)
            setOutput(values)
            return true
          },
          submitter: { searchConfig: { submitText: '提交表单', resetText: '重置表单' } },
        },
        h(
          'div',
          {
            className: 'demo-grid',
            style: {
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, .9fr)',
              gap: 28,
            },
          },
          h(
            'div',
            null,
            field(
              'accountId',
              '账号',
              h(selectors.GlobalAccountSelect, {
                request: accountRequest,
                resolve: accountResolve,
                disabled,
              }),
            ),
            field(
              'memberIds',
              '成员',
              h(selectors.OrganizationMemberSelect, { ...memberProps, multiple: true }),
            ),
            field(
              'roleIds',
              '角色',
              h(selectors.RoleSelect, {
                roles: loaded ? roles : [],
                originalRoleIds: ['role-3'],
                disabled,
              }),
            ),
            field(
              'organizationIds',
              '组织',
              h(selectors.OrganizationSelect, { units: loaded ? units : [], disabled }),
            ),
            field(
              'organizationRelations',
              '组织与职责',
              h(selectors.OrganizationSelect, {
                units: loaded ? units : [],
                enableDuties: true,
                disabled,
              }),
            ),
            field(
              'positionIds',
              '岗位',
              h(selectors.PositionSelect, { positions: loaded ? positions : [], disabled }),
            ),
            field('memberId', '成员（单选）', h(selectors.OrganizationMemberSelect, memberProps)),
            field(
              'otherOrganizationIds',
              '独立组织字段',
              h(selectors.OrganizationSelect, { units, disabled }),
            ),
          ),
          h(
            'aside',
            {
              style: {
                background: '#f8f7ff',
                padding: 20,
                border: '1px solid #ede9fc',
                borderRadius: 14,
                alignSelf: 'start',
                minWidth: 0,
              },
            },
            h('strong', null, '表单当前值'),
            h(
              'pre',
              {
                style: {
                  fontSize: 12,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  marginTop: 14,
                },
              },
              JSON.stringify(output, null, 2),
            ),
          ),
        ),
      ),
      h(
        'style',
        null,
        '@media(max-width: 600px){.demo-grid{grid-template-columns:minmax(0,1fr)!important}}',
      ),
    )
  }
  const uiLocale = locale.getUiLocale('zh_CN')
  dom.default
    .createRoot(document.getElementById('root'))
    .render(
      h(
        i18n.default,
        { store: store.appI18nStore },
        h(
          css.StyleProvider,
          { layer: true },
          h(
            antd.ConfigProvider,
            { theme: theme.appTheme, locale: uiLocale.antd },
            h(pro.ProConfigProvider, { intl: uiLocale.pro }, h(Demo)),
          ),
        ),
      ),
    )
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('表单未挂载')), 10000)
    /** 等待真实 Form 暴露实例。 */
    function ready() {
      if (!qa.form) return requestAnimationFrame(ready)
      clearTimeout(timer)
      resolve()
    }
    ready()
  })
}
