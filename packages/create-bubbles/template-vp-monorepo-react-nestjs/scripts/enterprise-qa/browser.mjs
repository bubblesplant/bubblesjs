import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  loadRuntime,
  privateStatePath,
  readPrivateState,
  writePrivateState,
  randomIdentity,
  ensure,
  createReporter,
  uiDirectory,
} from './runtime.mjs'
import {
  apiClient,
  registerIdentity,
  loginIdentity,
  flattenMenus,
  findMember,
} from './http-support.mjs'

const runtimeRequire = createRequire(
  resolve(
    process.env.ENTERPRISE_QA_PLAYWRIGHT_ROOT ??
      'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node',
    'package.json',
  ),
)
const { chromium } = runtimeRequire('playwright')
const { runtime, runtimePath } = loadRuntime(process.argv[2])
const request = apiClient(runtime)
const httpState = readPrivateState(privateStatePath(runtimePath, 'http'))
const state = { platform: httpState.platform, identities: {}, fixtures: {} }
const statePath = privateStatePath(runtimePath, 'browser')
const report = createReporter('browser')
const baseUrl = 'http://127.0.0.1:5301'
const suffix = randomBytes(4).toString('hex')
const errors = []
const screenshots = uiDirectory
mkdirSync(screenshots, { recursive: true })
let browser
let page
let context

function sanitize(message) {
  let safe = String(message)
  for (const identity of [state.platform, ...Object.values(state.identities)]) {
    for (const key of ['account', 'password', 'accessToken']) {
      if (identity?.[key]) safe = safe.split(identity[key]).join('[运行期凭据]')
    }
  }
  return safe.slice(0, 1800)
}

async function check(id, acceptance, run) {
  return report.check({
    id,
    acceptance,
    run: async () => {
      try {
        return await run()
      } catch (error) {
        throw new Error(sanitize(error.message))
      }
    },
  })
}

async function visible(text) {
  await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible' })
}

async function login(identity) {
  await page.goto(`${baseUrl}/login`)
  await page.getByLabel('账号', { exact: true }).fill(identity.account)
  await page.getByLabel('密码', { exact: true }).fill(identity.password)
  const response = page.waitForResponse(
    (item) => item.url().endsWith('/auth/login') && item.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /登\s*录/ }).click()
  ensure((await response).status() === 200, '真实 UI 登录请求失败')
  await page.waitForURL('**/workspaces')
  await page.getByRole('heading', { name: '选择工作空间' }).waitFor()
}

async function logout() {
  await page.getByRole('button', { name: /退出(?:登录)?$/ }).click()
  await page.waitForURL('**/login')
}

async function enter(path) {
  await page.locator(`a[href="${path}"]`).first().click()
  await page.waitForURL(`${baseUrl}${path}`)
}

async function submit({ button, path, status = 200, method = 'POST', dialog = true }) {
  const response = page.waitForResponse(
    (item) => new URL(item.url()).pathname === `/api${path}` && item.request().method() === method,
  )
  await (dialog ? page.getByRole('dialog') : page)
    .getByRole('button', { name: button, exact: true })
    .click()
  const result = await response
  ensure(result.status() === status, `UI ${method} ${path} 预期 ${status}，实际 ${result.status()}`)
  if (dialog) await page.getByRole('dialog').waitFor({ state: 'hidden' })
  return result.json()
}

async function screenshot(name) {
  await page
    .locator('h1, .ant-pro-table-list-toolbar-title, .ant-modal-title')
    .filter({ visible: true })
    .first()
    .waitFor()
  const masks = [page.locator('.scope-account'), page.locator('code')]
  for (const identity of [state.platform, ...Object.values(state.identities)])
    masks.push(page.getByText(identity.account, { exact: true }))
  await page.screenshot({
    path: resolve(screenshots, `${name}.png`),
    fullPage: true,
    mask: masks,
    animations: 'disabled',
  })
  return `ui/${name}.png`
}

/** 在全局账号选择器中按完整账号搜索并选择目标账号。 */
async function selectGlobalAccount({ dialog, label, identity }) {
  const field = dialog.getByLabel(label, { exact: true })
  await field.click()
  await field.fill(identity.account)
  const option = page
    .locator('.ant-select-item-option:not(.ant-select-item-option-disabled)')
    .filter({ hasText: identity.account })
    .first()
  await option.waitFor({ state: 'visible' })
  await option.click()
}

/** 打开组织成员浏览器，按完整账号定位并确认单个企业成员。 */
async function selectOrganizationMember({ dialog, label, identity }) {
  await dialog.getByLabel(label, { exact: true }).click()
  const selector = page.getByRole('dialog', { name: '选择成员', exact: true })
  await selector.waitFor({ state: 'visible' })
  await selector.getByLabel('搜索', { exact: true }).fill(identity.account)
  await selector.getByRole('button', { name: '查询', exact: true }).click()
  const row = selector.getByRole('row').filter({ hasText: identity.account })
  await row.waitFor({ state: 'visible' })
  await row.getByRole('radio').check()
  await selector.getByRole('button', { name: /确\s*定/ }).click()
  await selector.waitFor({ state: 'hidden' })
}

/** 通过当前实体创建弹窗选择首位管理员并提交企业或项目。 */
async function createEntity({ project = false, identity, base }) {
  const label = project ? '项目' : '企业'
  const action = project ? '创建项目' : '开通企业'
  await page.getByRole('button', { name: action }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(`${label}名称`, { exact: true }).fill(`浏览器${label}${suffix}`)
  await dialog
    .getByLabel(`${label}编码`, { exact: true })
    .fill(`ui_${project ? 'p' : 'c'}_${suffix}`)
  if (project) await selectOrganizationMember({ dialog, label: '首位项目管理员', identity })
  else await selectGlobalAccount({ dialog, label: '首位企业管理员', identity })
  return submit({
    button: action,
    path: project ? `${base}/projects` : '/platform/companies',
    status: 201,
  })
}

/** 创建企业邀请链接，切换到目标账号接受，再恢复企业管理员会话。 */
async function inviteCompanyMember({ administrator, member, base }) {
  await page.getByRole('button', { name: '邀请成员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '邀请企业成员', exact: true })
  await dialog.waitFor({ state: 'visible' })
  const response = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === `/api${base}/member-invitations` &&
      item.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: '创建邀请链接', exact: true }).click()
  const issued = await response
  ensure(issued.status() === 201, `UI 创建企业邀请预期 201，实际 ${issued.status()}`)
  const invitationUrl = await dialog.locator('textarea[readonly]').inputValue()
  ensure(
    invitationUrl.startsWith(`${baseUrl}/member-invitations/accept?token=`),
    '企业邀请弹窗未显示有效的完整邀请链接',
  )
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })

  await logout()
  await login(member)
  await page.goto(invitationUrl)
  const acceptance = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === '/api/company-member-invitations/accept' &&
      item.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '确认加入企业', exact: true }).click()
  const accepted = await acceptance
  ensure(accepted.status() === 200, `UI 接受企业邀请预期 200，实际 ${accepted.status()}`)
  await page.waitForURL('**/workspaces')

  await logout()
  await login(administrator)
  await enter(base)
  await enter(`${base}/members`)
  await visible(member.name)
}

/** 从所属企业成员中选择目标账号并添加为项目成员。 */
async function addProjectMember({ identity, base }) {
  await page.getByRole('button', { name: '添加成员' }).click()
  const dialog = page.getByRole('dialog', { name: '添加项目成员', exact: true })
  await selectOrganizationMember({ dialog, label: '企业成员', identity })
  await submit({ button: '添加成员', path: `${base}/members`, status: 201 })
  await visible(identity.name)
}

async function updateMenu({ scopeType, id, changes }) {
  const tree = (
    await request({ actor: state.platform, path: `/platform/menus?scopeType=${scopeType}` })
  ).body
  return request({
    actor: state.platform,
    method: 'PATCH',
    path: `/platform/menus/${id}`,
    body: { expectedVersion: tree.version, ...changes },
  })
}

try {
  await loginIdentity({ request, identity: state.platform })
  for (const label of ['enterprise', 'project', 'member', 'replacement']) {
    const identity = randomIdentity(`ui_${label}`)
    identity.name = `界面验收${label}${suffix}`
    state.identities[label] = await registerIdentity({ request, identity })
    await loginIdentity({ request, identity })
  }
  state.identities.empty = randomIdentity('ui_empty')
  state.identities.empty.name = `界面新成员${suffix}`
  writePrivateState(statePath, state)
  browser = await chromium.launch({
    executablePath:
      process.env.ENTERPRISE_QA_CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  })
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
  page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(sanitize(error.message)))

  await check('browser-register-login-empty-workspace', ['AC-01', 'AC-08'], async () => {
    const identity = state.identities.empty
    await page.goto(`${baseUrl}/register`)
    for (const [label, value] of [
      ['姓名', identity.name],
      ['账号', identity.account],
      ['密码', identity.password],
      ['确认密码', identity.password],
    ]) {
      await page.getByLabel(label, { exact: true }).fill(value)
    }
    const response = page.waitForResponse(
      (item) => item.url().endsWith('/auth/register') && item.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '注册账号' }).click()
    const registered = await response
    ensure(registered.status() === 201, `真实 UI 注册预期201，实际${registered.status()}`)
    identity.id = (await registered.json()).id
    await page.waitForURL('**/login?registered=1')
    await login(identity)
    await visible('暂未加入企业，请联系管理员添加')
    ensure(
      (await page.getByRole('link', { name: '进入空间' }).count()) === 0,
      '普通新账号出现未授权空间',
    )
    const evidence = await screenshot('workspace-empty')
    await logout()
    return evidence
  })

  await check('browser-platform-entry-and-create-company', ['AC-01', 'AC-02'], async () => {
    await login(state.platform)
    ensure(
      (await page.getByRole('link', { name: '进入空间' }).count()) === 1,
      '无企业平台管理员入口不符合预期',
    )
    await enter('/platform')
    await enter('/platform/companies')
    state.fixtures.company = await createEntity({ identity: state.identities.enterprise })
    await visible(state.fixtures.company.name)
    return screenshot('company-created')
  })
  ensure(state.fixtures.company, '企业创建流程失败，不能继续依赖流程')
  const base = `/companies/${state.fixtures.company.id}`
  state.fixtures.base = base

  await check('browser-company-member-and-create-project', ['AC-01', 'AC-11'], async () => {
    await logout()
    await login(state.identities.enterprise)
    await enter(base)
    await enter(`${base}/members`)
    await inviteCompanyMember({
      administrator: state.identities.enterprise,
      member: state.identities.project,
      base,
    })
    await inviteCompanyMember({
      administrator: state.identities.enterprise,
      member: state.identities.member,
      base,
    })
    await enter(`${base}/projects`)
    state.fixtures.project = await createEntity({
      project: true,
      identity: state.identities.project,
      base,
    })
    await visible(state.fixtures.project.name)
    return screenshot('project-created')
  })
  ensure(state.fixtures.project, '项目创建流程失败，不能继续依赖流程')
  const projectBase = `${base}/projects/${state.fixtures.project.id}`
  state.fixtures.projectBase = projectBase

  await check('browser-profile-consecutive-saves', ['AC-01', 'AC-06'], async () => {
    await enter(`${base}/profile`)
    for (let revision = 1; revision <= 2; revision++) {
      await page.getByLabel('说明', { exact: true }).fill(`界面连续保存第${revision}次`)
      await submit({ button: '保存资料', path: base, method: 'PATCH', dialog: false })
      await page.getByLabel('说明', { exact: true }).waitFor()
    }
    const detail = (await request({ actor: state.identities.enterprise, path: base })).body
    ensure(detail.description === '界面连续保存第2次', '连续保存未提交第二次内容')
  })

  await check(
    'browser-role-create-permission-and-member-assignment',
    ['AC-01', 'AC-03', 'AC-06', 'AC-11', 'AC-12'],
    async () => {
      await enter(`${base}/roles`)
      await page.getByRole('button', { name: '创建角色' }).click()
      await page
        .getByRole('dialog')
        .getByLabel('角色名称', { exact: true })
        .fill(`界面资料角色${suffix}`)
      const role = await submit({ button: '保存角色', path: `${base}/roles`, status: 201 })
      state.fixtures.role = role
      const row = page.getByRole('row').filter({ hasText: role.name })
      await row.getByRole('button', { name: '配置权限', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: '全选可授予权限' }).click()
      ensure(
        (await dialog.locator('.ant-tree').getByText('创建项目', { exact: true }).count()) === 0,
        '自定义权限树错误包含创建项目',
      )
      await submit({
        button: '保存权限',
        path: `${base}/roles/${role.id}/permissions`,
        method: 'PUT',
      })
      await enter(`${base}/members`)
      const memberRow = page.getByRole('row').filter({ hasText: state.identities.member.name })
      await memberRow.getByRole('button', { name: '分配角色' }).click()
      await page.getByRole('dialog').getByLabel('角色', { exact: true }).click()
      await page
        .locator('.ant-select-item-option-content')
        .getByText(role.name, { exact: true })
        .click()
      await page.keyboard.press('Escape')
      const member = await findMember({
        request,
        actor: state.identities.enterprise,
        base,
        userId: state.identities.member.id,
      })
      await submit({
        button: '保存角色',
        path: `${base}/members/${member.id}/roles`,
        method: 'PUT',
      })
      await memberRow.getByText(role.name, { exact: true }).waitFor()
      return screenshot('member-role-assigned')
    },
  )

  await check(
    'browser-project-administrator-and-member-access',
    ['AC-01', 'AC-02', 'AC-11'],
    async () => {
      await logout()
      await login(state.identities.project)
      await enter(base)
      await enter(`${base}/projects`)
      ensure(
        (await page.getByRole('button', { name: '创建项目' }).count()) === 0,
        '项目管理员拥有企业创建项目按钮',
      )
      await enter(projectBase)
      await enter(`${projectBase}/members`)
      await addProjectMember({ identity: state.identities.member, base: projectBase })
      await logout()
      await login(state.identities.member)
      await enter(base)
      await enter(`${base}/profile`)
      await visible('企业资料')
      await enter(`${base}/projects`)
      ensure(
        (await page.getByRole('button', { name: '创建项目' }).count()) === 0,
        '自定义角色获取了创建项目按钮',
      )
      await enter(projectBase)
      await page.getByRole('heading', { name: '项目工作台', exact: true }).waitFor()
      return screenshot('project-member-home')
    },
  )

  await check('browser-role-revocation-refresh-and-forbidden', ['AC-03', 'AC-04'], async () => {
    await page.goto(`${baseUrl}${base}/profile`)
    await visible('企业资料')
    const role = (
      await request({
        actor: state.identities.enterprise,
        path: `${base}/roles/${state.fixtures.role.id}`,
      })
    ).body
    await request({
      actor: state.identities.enterprise,
      method: 'PUT',
      path: `${base}/roles/${role.id}/permissions`,
      body: { expectedVersion: role.version, permissionKeys: [] },
    })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await visible('暂无访问权限')
    ensure(
      (await page.getByRole('button', { name: '保存资料', exact: true }).count()) === 0,
      '撤权后仍显示资料写按钮',
    )
    const evidence = await screenshot('permission-revoked')
    await page.goto(`${baseUrl}/companies/${randomUUID()}`)
    await visible('页面或资源不存在')
    return evidence
  })

  await check('browser-switch-race-and-logout-account-isolation', ['AC-05'], async () => {
    await page.goto(`${baseUrl}/workspaces`)
    await enter(base)
    let release
    let observed
    const observedPromise = new Promise((resolve) => {
      observed = resolve
    })
    const releasePromise = new Promise((resolve) => {
      release = resolve
    })
    const pattern = `**/api${base}/access`
    await page.route(pattern, async (route) => {
      const response = await route.fetch()
      observed()
      await releasePromise
      await route.fulfill({ response }).catch(() => {})
    })
    try {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await Promise.race([
        observedPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('未捕获用于竞态验证的旧权限请求')), 12000),
        ),
      ])
      await page.getByRole('button', { name: '切换空间' }).click()
      await page.waitForURL('**/workspaces')
      await enter(projectBase)
      release()
      await page.waitForTimeout(500)
      ensure(new URL(page.url()).pathname === projectBase, '迟到企业权限覆盖了项目路由')
      await page.locator('.scope-strip').getByText('项目空间', { exact: true }).waitFor()
      ensure(
        (await page.locator('.scope-strip').innerText()).includes(state.fixtures.project.name),
        '迟到请求覆盖目标工作空间',
      )
    } finally {
      release()
      await page.unroute(pattern)
    }
    await logout()
    await login(state.identities.empty)
    await visible('暂未加入企业，请联系管理员添加')
    ensure(
      (await page.getByText(state.fixtures.company.name, { exact: true }).count()) === 0,
      '退出换号后显示上一用户企业',
    )
  })

  await check('browser-menu-hide-disable-and-recovery-navigation', ['AC-03', 'AC-06'], async () => {
    await logout()
    await login(state.platform)
    await enter('/platform')
    const tree = (
      await request({ actor: state.platform, path: '/platform/menus?scopeType=platform' })
    ).body
    const home = flattenMenus(tree.items).find(
      (item) => item.routeKey === 'platform.home' && item.type === 'page',
    )
    ensure(home, '找不到平台首页菜单')
    try {
      await updateMenu({ scopeType: 'platform', id: home.id, changes: { hidden: true } })
      await page.reload()
      ensure(
        (await page
          .locator('aside')
          .getByRole('link', { name: home.name, exact: true })
          .count()) === 0,
        '隐藏首页仍出现在导航',
      )
      ensure(
        (await page.getByText('暂无访问权限', { exact: true }).count()) === 0,
        '隐藏菜单错误阻断已授权访问',
      )
      await updateMenu({
        scopeType: 'platform',
        id: home.id,
        changes: { hidden: false, status: 'disabled' },
      })
      await page.goto(`${baseUrl}/workspaces`)
      await page.locator('a[href="/platform"]').first().click()
      await page.locator('a[href="/platform/menus"]').first().waitFor()
      await enter('/platform/menus')
      const row = page.getByRole('row').filter({ hasText: home.name }).first()
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      await page
        .getByRole('dialog')
        .locator('.ant-form-item')
        .filter({ hasText: '功能状态' })
        .getByRole('combobox')
        .click()
      await page
        .locator('.ant-select-item-option-content')
        .getByText('启用', { exact: true })
        .click()
      await submit({ button: '保存菜单', path: `/platform/menus/${home.id}`, method: 'PATCH' })
      await page.goto(`${baseUrl}/platform`)
      await page.getByRole('heading', { name: '平台工作台', exact: true }).waitFor()
      await page.locator('a[href="/platform/menus"]').first().waitFor()
      ensure(
        (await page.getByText('暂无访问权限', { exact: true }).count()) === 0,
        'UI恢复首页后仍拒绝访问',
      )
      return screenshot('platform-menu-recovery')
    } finally {
      await updateMenu({
        scopeType: 'platform',
        id: home.id,
        changes: { hidden: home.hidden, status: home.status },
      })
    }
  })

  await check('browser-unknown-page-compatibility', ['AC-13'], async () => {
    const pattern = '**/api/platform/access'
    let injected = false
    await page.route(pattern, async (route) => {
      const response = await route.fetch()
      const payload = await response.json()
      const unknown = {
        id: randomUUID(),
        scopeType: 'platform',
        parentId: null,
        type: 'page',
        name: '未发布页面夹具',
        icon: '',
        sort: 500,
        hidden: false,
        status: 'active',
        routeKey: 'platform.future-qa',
        permissionKey: 'platform.future-qa.read',
        protected: false,
        children: [],
      }
      payload.permissionKeys.push(unknown.permissionKey)
      payload.menus.push({
        ...unknown,
        id: randomUUID(),
        type: 'directory',
        name: '未知空目录夹具',
        routeKey: null,
        permissionKey: null,
        children: [unknown],
      })
      injected = true
      await route.fulfill({ response, json: payload })
    })
    try {
      await page.goto(`${baseUrl}/platform`)
      await page.locator('a[href="/platform/menus"]').first().waitFor()
      ensure(injected, '未注入版本兼容响应夹具')
      ensure(
        (await page.getByText('未发布页面夹具', { exact: true }).count()) === 0 &&
          (await page.getByText('未知空目录夹具', { exact: true }).count()) === 0,
        '前端显示未注册页面或空目录',
      )
      await page.goto(`${baseUrl}/platform/future-qa`)
      await visible('页面不存在')
      await page.getByRole('button', { name: '返回工作空间' }).waitFor()
      return '只在浏览器响应中注入未知 routeKey；旧前端过滤页面与空目录、直达404，服务端菜单未修改。新版页面注册由前端单测覆盖。'
    } finally {
      await page.unroute(pattern)
    }
  })

  await check('browser-cleanup-preview-and-disabled-submit', ['AC-14'], async () => {
    await page.goto(`${baseUrl}/platform/menus`)
    await page.getByRole('button', { name: '清理废弃权限' }).click()
    await visible('当前没有需要清理的废弃权限。')
    ensure(
      await page.getByRole('button', { name: '确认清理废弃权限', exact: true }).isDisabled(),
      '空预览允许执行清理',
    )
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭', exact: true })
      .click({ trial: true })
    const evidence = await screenshot('cleanup-empty-preview')
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
    return evidence
  })

  await check(
    'browser-disabled-company-administrator-replacement',
    ['AC-09', 'AC-10'],
    async () => {
      await page.goto(`${baseUrl}/platform/companies`)
      const row = page.getByRole('row').filter({ hasText: state.fixtures.company.name })
      await row.getByRole('button', { name: '停用', exact: true }).click()
      const popup = page.locator('.ant-popover').filter({ hasText: '停用企业？' })
      await popup.getByRole('button', { name: /确\s*定/ }).click()
      await row.getByRole('button', { name: '启用', exact: true }).waitFor()
      await row.getByRole('button', { name: '设置管理员', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await selectGlobalAccount({
        dialog,
        label: '新管理员',
        identity: state.identities.replacement,
      })
      await dialog.getByLabel('被替换的管理员（可选）', { exact: true }).click()
      await page
        .locator('.ant-select-item-option-content')
        .filter({ hasText: state.identities.enterprise.name })
        .click()
      await submit({
        button: '保存管理员',
        path: `/platform/companies/${state.fixtures.company.id}/administrator`,
      })
      ensure(
        await row.getByRole('button', { name: '启用', exact: true }).isVisible(),
        '更换管理员错误启用企业',
      )
      await row.getByRole('button', { name: '启用', exact: true }).click()
      await page
        .locator('.ant-popover')
        .filter({ hasText: '启用企业？' })
        .getByRole('button', { name: /确\s*定/ })
        .click()
      await row.getByRole('button', { name: '停用', exact: true }).waitFor()
      await logout()
      await login(state.identities.replacement)
      await enter(base)
      await enter(`${base}/projects`)
      await page.getByRole('button', { name: '创建项目' }).waitFor()
      return screenshot('replacement-administrator')
    },
  )

  await check('browser-no-runtime-errors', ['AC-01', 'AC-05'], async () => {
    ensure(errors.length === 0, `浏览器pageerror：${errors.join('; ')}`)
  })
} catch (error) {
  report.results.push({
    id: 'browser-setup-or-dependent-flow',
    acceptance: ['AC-01'],
    status: 'failed',
    evidence: sanitize(error.message),
  })
  process.stdout.write('FAIL browser-setup-or-dependent-flow\n')
} finally {
  writePrivateState(statePath, state)
  await browser?.close()
  report.save()
  if (report.results.some((item) => item.status === 'failed')) process.exitCode = 1
}
