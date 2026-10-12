import assert from 'node:assert/strict'
import { checkHeaderHover } from './hover.mjs'

/** 等待筛选和分页后的卡片名称稳定，再检查数量与顺序。 */
export async function checkCards(page, expected) {
  await page.waitForFunction((names) => {
    const actual = [...document.querySelectorAll('.workspace-card h2, .workspace-card h3')].map(
      (element) => element.textContent.trim(),
    )
    return JSON.stringify(actual) === JSON.stringify(names)
  }, expected)
  assert.deepEqual(
    await page.locator('.workspace-card h2, .workspace-card h3').allTextContents(),
    expected,
  )
}

/** 验证授权类型计数基于搜索和企业条件，未被当前类型条件二次过滤。 */
export async function checkTypeCounts(page, counts) {
  const labels = { all: '全部', platform: '平台', company: '企业', project: '项目' }
  for (const [type, count] of Object.entries(counts)) {
    const button = page.locator('button[aria-pressed]').filter({ hasText: labels[type] })
    assert.equal(await button.count(), 1, `类型入口缺失：${labels[type]}`)
    assert.equal((await button.innerText()).replace(/\s/g, ''), `${labels[type]}${count}`)
  }
}

/** 点击带明确按下状态的空间类型入口。 */
export async function chooseType(page, label) {
  const button = page.locator('button[aria-pressed]').filter({ hasText: label })
  await button.click()
  assert.equal(await button.getAttribute('aria-pressed'), 'true')
}

/** 通过实际 Ant Design 下拉选项选择企业，支持仅项目授权的企业。 */
export async function chooseCompany(page, label) {
  await page.getByRole('combobox', { name: '所属企业' }).click()
  const option = page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: label })
  await option.click()
}

/** 检查页面、卡片和头部动作在指定宽度内，记录实际网格列数。 */
export async function checkPageBounds(page) {
  const geometry = await page.evaluate(() => {
    const grid = document.querySelector('.workspace-grid')
    const cards = [...document.querySelectorAll('.workspace-card')].map((element) => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, right: box.right, width: box.width }
    })
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      cards,
    }
  })
  assert(geometry.scrollWidth <= geometry.width + 1, '页面横向溢出')
  for (const card of geometry.cards) {
    assert(card.x >= 0 && card.right <= geometry.width + 1, '卡片超出视口')
  }
  if (geometry.cards.length) assert.equal(geometry.columns, geometry.width >= 1100 ? 3 : 1)
  return geometry
}

/** 记录卡片 hover 的隔离布局计数和盒模型，避免颜色变化引起误判。 */
export async function checkCardHover({ context, page }) {
  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  const card = page.locator('.workspace-card').first()
  const box = await card.boundingBox()
  await page.mouse.move(4, 200)
  await page.waitForTimeout(350)
  const initial = await card.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      box: [box.x, box.y, box.width, box.height],
      borderWidth: style.borderWidth,
      transform: style.transform,
    }
  })
  const before = await session.send('Performance.getMetrics')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(260)
  const after = await session.send('Performance.getMetrics')
  const metric = (result, name) => result.metrics.find((item) => item.name === name).value
  const layoutCount = metric(after, 'LayoutCount') - metric(before, 'LayoutCount')
  assert.equal(layoutCount, 0, '卡片纯 hover 发生布局')
  for (let index = 0; index < 12; index += 1) {
    await page.evaluate(() => new Promise(requestAnimationFrame))
    const current = await card.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        box: [box.x, box.y, box.width, box.height],
        borderWidth: style.borderWidth,
        transform: style.transform,
      }
    })
    assert.deepEqual(current, initial, '卡片 hover 改变盒模型或位置')
  }
  await session.detach()
  return { layoutCount, geometryStable: true, sampledFrames: 12 }
}

/** 覆盖当前页面语言小图标、Popover箭头、少量语言无搜索、账户改密与退出。 */
export async function checkSharedHeader({
  context,
  page,
  state,
  english = false,
  actions = false,
}) {
  const header = page.locator('.workspace-landing-header, .ant-pro-global-header').first()
  const hover = await checkHeaderHover({ context, page, header })
  await page.locator('.locale-switch-trigger').click()
  const popup = page.locator('.locale-switch-popover')
  await popup.waitFor({ state: 'visible' })
  await page.waitForTimeout(240)
  assert.equal(await popup.getByRole('menuitemradio').count(), 2)
  assert.equal(await popup.getByRole('textbox').count(), 0, '实际两语言不应展示搜索框')
  const box = await popup.boundingBox()
  const arrow = await popup.locator('.ant-popover-arrow').boundingBox()
  const trigger = await page.locator('.locale-switch-trigger').boundingBox()
  assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, '语言浮层横向溢出')
  assert(arrow && arrow.width > 0 && arrow.height > 0, '语言浮层箭头缺失')
  assert(
    Math.abs(arrow.x + arrow.width / 2 - trigger.x - trigger.width / 2) < 2,
    '箭头未指向语言图标',
  )
  await popup
    .getByRole('menuitemradio')
    .filter({ hasText: english ? '简体中文' : 'English' })
    .click()
  await popup.waitFor({ state: 'hidden' })
  await page.waitForFunction(
    (lang) => document.documentElement.lang === lang,
    english ? 'zh-CN' : 'en',
  )
  const changedEnglish = !english
  await page.locator('.workspace-account-trigger').click()
  await page.locator('.workspace-account-panel').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.workspace-account-details strong').innerText(), '林间')
  const accountBox = await page.locator('.workspace-account-panel').boundingBox()
  assert(accountBox.x >= 0 && accountBox.x + accountBox.width <= page.viewportSize().width + 1)
  if (actions) {
    await page
      .getByRole('menuitem', { name: changedEnglish ? 'Change Password' : '修改密码' })
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    assert.deepEqual(
      await dialog
        .locator('input[type=password]')
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
      ['', '', ''],
    )
    await dialog.getByRole('button', { name: changedEnglish ? 'Cancel' : /取\s*消/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.locator('.workspace-account-trigger').click()
    await page.getByRole('menuitem', { name: changedEnglish ? 'Sign Out' : '退出登录' }).click()
    await page.waitForURL('**/login')
    assert.equal(state.logoutRequests, 1)
    assert(!(await context.cookies()).some((cookie) => cookie.name === 'token'))
  } else {
    await page.keyboard.press('Escape')
    await page.locator('.workspace-account-panel').waitFor({ state: 'hidden' })
  }
  return {
    hover,
    language: { count: 2, noSearch: true, arrow: true, switched: true },
    account: true,
    accountActions: actions,
  }
}
