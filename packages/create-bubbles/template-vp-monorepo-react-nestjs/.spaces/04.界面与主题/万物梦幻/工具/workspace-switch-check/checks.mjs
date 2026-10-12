import assert from 'node:assert/strict'
import { workspaceEntries } from './fixtures.mjs'
import {
  checkCards,
  checkTypeCounts,
  chooseType,
  chooseCompany,
  checkCardHover,
  checkSharedHeader,
} from './helpers.mjs'

/** 将虚构空间作用域转换为预期路由，仅用于独立校验页面输出链接。 */
function expectedPath(scope) {
  if (scope.type === 'platform') return '/platform'
  const company = `/companies/${scope.companyId}`
  return scope.type === 'project' ? `${company}/projects/${scope.projectId}` : company
}

/** 检查页面卡片各有唯一进入动作、正确路由以及项目所属企业。 */
async function checkLinks(page, entries) {
  for (let index = 0; index < entries.length; index += 1) {
    const card = page.locator('.workspace-card').nth(index)
    const entry = entries[index]
    assert.equal(await card.locator('a').count(), 1, '卡片存在重复进入动作')
    assert.equal(await card.locator('a').getAttribute('href'), expectedPath(entry.scope))
    if (entry.companyName)
      assert((await card.innerText()).includes(entry.companyName), '项目缺少所属企业')
    assert((await card.innerText()).includes(entry.administrator ? '管理员' : '成员'), '角色缺失')
  }
}

/** 通过分页控件导航，并等待当前页状态更新。 */
async function choosePage(page, number) {
  await page.locator(`.ant-pagination-item-${number}`).click()
  await page.waitForFunction(
    (value) =>
      document.querySelector('.ant-pagination-item-active')?.getAttribute('title') ===
      String(value),
    number,
  )
}

/** 刷新授权清单并等待真实路由 revalidator 完成。 */
async function refresh(page) {
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/workspaces'),
    page.locator('.workspace-refresh').click(),
  ])
  await page.waitForFunction(() => !document.querySelector('.workspace-landing .ant-btn-loading'))
}

/** 覆盖分页、大小写搜索、联合筛选、只项目企业、刷新保留与页码修正。 */
export async function checkFilters({ context, page, state, capture }) {
  const names = (entries) => entries.map((entry) => entry.name)
  const search = page.getByRole('textbox', { name: '搜索工作空间' })
  await checkCards(page, names(workspaceEntries.slice(0, 6)))
  await checkTypeCounts(page, { all: 14, platform: 1, company: 2, project: 11 })
  assert.equal(
    await page.locator('.workspace-card').filter({ hasText: '当前空间' }).count(),
    0,
    '直达错误标记当前空间',
  )
  assert.equal(
    await page.locator('.workspace-return-current').count(),
    0,
    '直达错误展示返回当前空间',
  )
  const cardHover = await checkCardHover({ context, page })
  await checkLinks(page, workspaceEntries.slice(0, 6))
  await capture('workspace-switch-desktop')
  await choosePage(page, 2)
  await checkCards(page, names(workspaceEntries.slice(6, 12)))
  await checkLinks(page, workspaceEntries.slice(6, 12))
  await choosePage(page, 3)
  await checkCards(page, names(workspaceEntries.slice(12)))
  await checkLinks(page, workspaceEntries.slice(12))

  await chooseType(page, '项目')
  const projects = workspaceEntries.filter((entry) => entry.scope.type === 'project')
  await checkCards(page, names(projects.slice(0, 6)))
  assert.equal(await page.locator('.ant-pagination-item-active').getAttribute('title'), '1')
  await checkTypeCounts(page, { all: 14, platform: 1, company: 2, project: 11 })
  await search.fill('  aLpHa  ')
  await checkCards(page, [workspaceEntries[4].name])
  await checkTypeCounts(page, { all: 1, platform: 0, company: 0, project: 1 })
  await search.fill('云间')
  await checkCards(
    page,
    names(projects.filter((entry) => entry.scope.companyId === 'qa-company-2')),
  )
  await checkTypeCounts(page, { all: 5, platform: 0, company: 1, project: 4 })
  await chooseCompany(page, '星屿科技')
  await checkCards(page, [])
  await checkTypeCounts(page, { all: 0, platform: 0, company: 0, project: 0 })
  await search.fill('')
  await checkCards(page, names(projects.filter((entry) => entry.scope.companyId === 'qa-company')))
  await checkTypeCounts(page, { all: 7, platform: 0, company: 1, project: 6 })
  await chooseType(page, '全部')
  const star = workspaceEntries.filter((entry) => entry.scope.companyId === 'qa-company')
  await checkCards(page, names(star.slice(0, 6)))
  await search.fill('星屿')
  await choosePage(page, 2)
  await checkCards(page, names(star.slice(6)))
  state.entries = workspaceEntries.filter((entry) => entry.scope.projectId !== 'qa-project-6')
  await refresh(page)
  await checkCards(page, names(star.slice(0, 6)))
  assert.equal(await search.inputValue(), '星屿', '刷新丢失搜索条件')
  assert(
    (await page.locator('.workspace-company-filter').innerText()).includes('星屿科技'),
    '刷新丢失企业条件',
  )
  await checkTypeCounts(page, { all: 6, platform: 0, company: 1, project: 5 })

  state.entries = workspaceEntries.filter(
    (entry) => entry.scope.type === 'platform' || entry.scope.companyId === 'qa-company-2',
  )
  await refresh(page)
  await checkCards(page, [])
  assert.equal(await search.inputValue(), '星屿')
  await search.fill('')
  await checkCards(page, names(state.entries))
  await checkTypeCounts(page, { all: 6, platform: 1, company: 1, project: 4 })
  state.entries = workspaceEntries
  await refresh(page)
  await chooseCompany(page, '仅项目授权企业')
  await checkCards(page, ['独立授权项目'])
  await checkTypeCounts(page, { all: 1, platform: 0, company: 0, project: 1 })
  await capture('workspace-switch-project-only-company')
  return {
    pagination: [6, 6, 2],
    allRoutesChecked: 14,
    caseInsensitiveSearch: true,
    combinedFilters: true,
    typeCounts: true,
    projectOnlyCompany: true,
    refreshPreservesFilters: true,
    removedCompanyReset: true,
    outOfRangePageClamped: true,
    cardHover,
  }
}

/** 模拟刷新失败并通过现有路由错误页重新加载，旧卡片不得残留。 */
export async function checkRefreshFailure({ page, state, capture }) {
  state.failWorkspaces = true
  await refresh(page)
  await page.getByText('暂时无法加载', { exact: true }).waitFor()
  assert.equal(await page.locator('.workspace-card').count(), 0)
  await capture('workspace-switch-refresh-error')
  state.failWorkspaces = false
  await page.getByRole('button', { name: '重新加载' }).click()
  await page.getByRole('heading', { name: '选择工作空间' }).waitFor()
  await checkCards(
    page,
    workspaceEntries.slice(0, 6).map((entry) => entry.name),
  )
  return { refreshFailure: true, staleCardsHidden: true, retry: true }
}

/** 检查左侧当前空间导航返回完整页，当前项真实且唯一，卡片可返回原空间。 */
export async function checkNavigation({ context, page, state, scopeType, capture }) {
  const entry = workspaceEntries.find((entry) => entry.scope.type === scopeType)
  const trigger = page.locator('.workspace-switch')
  await trigger.waitFor()
  assert.equal(await trigger.getAttribute('aria-label'), '切换空间')
  assert.equal(await trigger.getAttribute('href'), '/workspaces')
  assert.equal(await trigger.getAttribute('aria-haspopup'), null, '空间入口不应声明浮层')
  assert((await trigger.innerText()).includes(entry.name), '入口未展示当前空间名称')
  const header = await checkSharedHeader({ context, page, state })
  await page.locator('.locale-switch-trigger').click()
  await page
    .locator('.locale-switch-popover')
    .getByRole('menuitemradio')
    .filter({ hasText: '简体中文' })
    .click()
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN')
  await trigger.click()
  await page.waitForURL('**/workspaces')
  await page.getByRole('heading', { name: '选择工作空间' }).waitFor()
  const current = page.locator('.workspace-card-current')
  assert.equal(await current.count(), 1, '当前空间标记不唯一')
  assert((await current.innerText()).includes(entry.name), '当前空间默认标到其他项')
  await capture(`workspace-switch-current-${scopeType}-${page.viewportSize().width}`)
  await current.locator('a').click()
  await page.waitForURL(`${state.baseUrl}${expectedPath(entry.scope)}`)
  await page.locator('.workspace-switch').waitFor()
  await page.locator('.workspace-switch').click()
  await page.waitForURL('**/workspaces')
  const shortcut = page.locator('.workspace-return-current')
  await shortcut.waitFor()
  assert.equal(await shortcut.getAttribute('href'), expectedPath(entry.scope))
  await choosePage(page, 3)
  assert.equal(await current.count(), 0, '当前卡片应位于其他页')
  assert(await shortcut.isVisible(), '跨页丢失返回当前空间入口')
  const search = page.locator('input.workspace-search, .workspace-search input')
  await search.fill('云间')
  assert.equal(await current.count(), 0)
  assert(await shortcut.isVisible(), '过滤隐藏当前卡片时丢失返回入口')
  await shortcut.click()
  await page.waitForURL(`${state.baseUrl}${expectedPath(entry.scope)}`)
  await page.locator('.workspace-switch').click()
  await page.waitForURL('**/workspaces')
  await shortcut.waitFor()
  state.entries = state.entries.filter(
    (item) => expectedPath(item.scope) !== expectedPath(entry.scope),
  )
  await refresh(page)
  await shortcut.waitFor({ state: 'hidden' })
  assert.equal(await current.count(), 0, '撤权后保留当前空间标记')
  return {
    scopeType,
    leftNavigation: true,
    noSpacePopover: true,
    currentCorrect: true,
    enterCurrent: true,
    shortcut: {
      exists: true,
      crossPage: true,
      filtered: true,
      entersOriginal: true,
      revokedHidden: true,
    },
    header,
  }
}

/** DTO省略项目companyName时，已授权企业名称仍可用于筛选及卡片展示。 */
export async function checkMissingCompanyNames({ page, capture }) {
  await chooseCompany(page, '星屿科技')
  await page.getByRole('textbox', { name: '搜索工作空间' }).fill('星屿')
  await checkTypeCounts(page, { all: 7, platform: 0, company: 1, project: 6 })
  await chooseType(page, '项目')
  const entries = workspaceEntries.filter(
    (entry) => entry.scope.companyId === 'qa-company' && entry.scope.type === 'project',
  )
  await checkCards(
    page,
    entries.map((entry) => entry.name),
  )
  for (const card of await page.locator('.workspace-card').all()) {
    assert(
      (await card.innerText()).includes('所属企业 · 星屿科技'),
      '省略companyName时未回填已知企业名称',
    )
  }
  await capture('workspace-switch-missing-company-name')
  return { optionalCompanyName: true, knownCompanySearch: true, knownCompanyDisplay: true }
}

/** 覆盖无授权空间空态，语言和账户操作仍可使用。 */
export async function checkEmpty({ context, page, state, capture }) {
  await page.getByText('暂未加入企业，请联系管理员获取邀请链接').waitFor()
  assert.equal(await page.locator('.workspace-card').count(), 0)
  await capture('workspace-switch-empty')
  const header = await checkSharedHeader({ context, page, state, actions: true })
  return { emptyAccess: true, header }
}
