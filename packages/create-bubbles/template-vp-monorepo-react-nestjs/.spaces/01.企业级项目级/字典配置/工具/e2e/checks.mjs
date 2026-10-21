import assert from 'node:assert/strict'
import { resolve } from 'node:path'

/** 将已确认的字典归属转换为管理页面与管理接口的基准路径。 */
function scopeBase(scope) {
  if (scope.type === 'platform') return '/platform'
  const company = `/companies/${scope.companyId}`
  return scope.type === 'project' ? `${company}/projects/${scope.projectId}` : company
}

/** 在真实浏览器、完整服务与真实会话上验证管理、缓存和授权边界；不拦截 API。 */
export async function runBrowserChecks({ browser, environment, featureRoot, report }) {
  const { state, api } = environment
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const optionsReads = []
  const pageErrors = []
  const httpFailures = []
  page.on('pageerror', (error) => pageErrors.push(environment.redact(error.message)))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/dictionary-options') optionsReads.push(url.search)
  })
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/') && response.status() >= 500)
      httpFailures.push({ path, status: response.status() })
  })
  const code = 'e2e_units'
  const records = []

  /** 正常提交登录表单，检查服务端返回令牌确实存于 Redis。 */
  async function login(kind, next) {
    await page.goto(`${state.baseUrl}/login?next=${encodeURIComponent(next)}`)
    await page.getByLabel('账号', { exact: true }).fill(state.users[kind].account)
    await page.getByLabel('密码', { exact: true }).fill(state.password)
    const pending = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/auth/login',
    )
    await page.getByRole('button', { name: /登.*录/ }).click()
    const response = await pending
    assert.equal(response.status(), 200)
    state.tokens[kind] = (await response.json()).accessToken
    environment.rememberToken(state.tokens[kind])
    await page.waitForURL(`${state.baseUrl}${next}`)
    await page.getByRole('button', { name: /新增字典/ }).waitFor()
    assert.equal(await environment.sessionExists(state.tokens[kind]), 1)
  }

  /** 使用正常账户菜单退出，检查字典专属快照删除而其他 sessionStorage 保留。 */
  async function logout(kind) {
    await page.evaluate(() => sessionStorage.setItem('dictionary-e2e-sentinel', 'keep'))
    await page.getByRole('button', { name: '账户菜单' }).click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()
    await page.waitForURL(`${state.baseUrl}/login`)
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem('bubbles.dictionary-cache')),
      null,
    )
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem('dictionary-e2e-sentinel')),
      'keep',
    )
    assert.equal(
      (await context.cookies()).some((cookie) => cookie.name === 'token'),
      false,
    )
    assert.equal(await environment.sessionExists(state.tokens[kind]), 0)
    await api({ path: '/auth/me', token: state.tokens[kind], status: 401 })
  }

  /** 通过管理表单创建字典，并从真实 HTTP 响应获取服务端生成的标识与版本。 */
  async function createDictionary(scope) {
    const base = scopeBase(scope)
    await page.goto(`${state.baseUrl}${base}/dictionaries`)
    await page.getByRole('menuitem').filter({ hasText: '数据字典' }).waitFor()
    await page.getByRole('button', { name: /新增字典/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('字典编码').fill(code)
    await dialog.getByLabel('字典名称').fill(`${scope.type}验收字典`)
    await dialog.getByRole('button', { name: '新增选项' }).click()
    await dialog.getByLabel('选项值', { exact: true }).fill('m')
    await dialog.getByLabel('显示名称', { exact: true }).fill(`${scope.type}米`)
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api${base}/dictionaries` &&
        response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    const response = await pending
    assert.equal(response.status(), 201)
    const record = await response.json()
    assert.equal(record.version, 1)
    assert.equal(record.scope.type, scope.type)
    records.push(record)
    await dialog.waitFor({ state: 'hidden' })
    await page.getByText(record.name, { exact: true }).waitFor()
    return record
  }

  /** 打开真实 ProFormSelect 预览并验证服务端选项已显示。 */
  async function preview(record, label) {
    await page
      .getByRole('row')
      .filter({ hasText: record.name })
      .getByRole('button', { name: '预览选项' })
      .click()
    await page.getByRole('combobox', { name: '业务选项' }).click()
    await page.locator('.ant-select-item-option').filter({ hasText: label }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').locator('button.ant-modal-close').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }

  /** 使用真实编辑表单验证编码与值只读、版本提交、数据库落库和缓存失效。 */
  async function editDictionary(record) {
    const row = page.getByRole('row').filter({ hasText: record.name })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const dialog = page.getByRole('dialog')
    assert(await dialog.getByLabel('字典编码').isDisabled())
    assert(await dialog.getByLabel('选项值', { exact: true }).isDisabled())
    const label = `${record.scope.type}米（已更新）`
    await dialog.getByLabel('显示名称', { exact: true }).fill(label)
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api${scopeBase(record.scope)}/dictionaries/${record.id}` &&
        response.request().method() === 'PATCH',
    )
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    const response = await pending
    assert.equal(response.status(), 200)
    assert.equal(response.request().postDataJSON().expectedVersion, record.version)
    assert.equal('code' in response.request().postDataJSON(), false)
    const updated = await response.json()
    assert.equal(updated.version, record.version + 1)
    await dialog.waitFor({ state: 'hidden' })
    const saved = await environment.query('SELECT version, items FROM dictionaries WHERE id = $1', [
      record.id,
    ])
    assert.equal(saved.rows[0].version, updated.version)
    assert.equal(saved.rows[0].items[0].label, label)
    const before = optionsReads.length
    await preview(updated, label)
    assert.equal(optionsReads.length, before + 1)
    return updated
  }

  /** 截图只展示工具创建的虚构账号和字典，不包含密码、令牌或控制台。 */
  async function capture(name) {
    const path = `ui/e2e-${name}.png`
    await page.screenshot({
      path: resolve(featureRoot, path),
      fullPage: true,
      animations: 'disabled',
    })
    report.images.push(path)
  }

  try {
    await login('admin', '/platform/dictionaries')
    report.checks.push('真实页面登录平台管理员，Redis 存在对应会话')
    let platform = await createDictionary(state.scopes[0])
    await preview(platform, 'platform米')
    const initialReads = optionsReads.length
    await page.reload()
    await page.getByText(platform.name, { exact: true }).waitFor()
    await preview(platform, 'platform米')
    assert.equal(optionsReads.length, initialReads, '刷新应复用 sessionStorage 中的有效选项')
    const snapshot = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('bubbles.dictionary-cache')),
    )
    assert.equal(snapshot.ownerUserId, state.users.admin.id)
    assert.equal(JSON.stringify(snapshot).includes(state.tokens.admin), false)
    report.checks.push('真实 ProFormSelect 请求成功，刷新恢复缓存且不重复请求，快照不含令牌')
    platform = await editDictionary(platform)
    await capture('platform')
    report.checks.push('平台真实新增／编辑落库，编码和值只读，保存失效后重新请求')
    await logout('admin')
    report.checks.push('退出撤销 Redis 会话，旧令牌返回 401，仅清理字典专属 sessionStorage')

    await login('company', `/companies/${state.company.id}/dictionaries`)
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem('bubbles.dictionary-cache')),
      null,
    )
    report.checks.push('换号后旧字典缓存不继承，企业账号正常登录')
    const shared = await page.evaluate(async (dictionaryCode) => {
      const { requestDictionaryOptions } = await import('/src/store/dictionary/index.ts')
      return requestDictionaryOptions({ scope: { type: 'platform' }, code: dictionaryCode })
    }, code)
    assert.deepEqual(shared, [{ value: 'm', label: 'platform米（已更新）' }])
    const forbidden = await api({
      path: '/platform/dictionaries',
      token: state.tokens.company,
      status: 403,
    })
    assert.equal(forbidden.code, 'ACCESS.FORBIDDEN')
    report.checks.push('无平台角色的企业用户经真实统一方法读取平台共享字典，平台管理接口仍拒绝访问')

    for (const scope of state.scopes.slice(1)) {
      let record = await createDictionary(scope)
      await preview(record, `${scope.type}米`)
      record = await editDictionary(record)
      await capture(scope.type)
      const {
        code: _code,
        id: _id,
        scope: _scope,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        version,
        ...body
      } = record
      const path = `${scopeBase(scope)}/dictionaries/${record.id}`
      const conflict = await api({
        path,
        token: state.tokens.company,
        method: 'PATCH',
        status: 409,
        body: { ...body, expectedVersion: version - 1 },
      })
      assert.equal(conflict.code, 'ACCESS.VERSION_CONFLICT')
      const immutable = await api({
        path,
        token: state.tokens.company,
        method: 'PATCH',
        status: 409,
        body: {
          ...body,
          expectedVersion: version,
          items: [{ ...body.items[0], value: 'changed' }],
        },
      })
      assert.equal(immutable.code, 'DICTIONARY.ITEM_VALUE_IMMUTABLE')
      const params = new URLSearchParams({
        scopeType: scope.type,
        code,
        companyId: scope.companyId,
      })
      if (scope.projectId) params.set('projectId', scope.projectId)
      const options = await api({
        path: `/dictionary-options?${params}`,
        token: state.tokens.company,
      })
      assert.deepEqual(options, [{ value: 'm', label: `${scope.type}米（已更新）` }])
      const inaccessible = await api({
        path: `/dictionary-options?${params}`,
        token: state.tokens.outsider,
        status: 404,
      })
      assert.equal(inaccessible.code, 'ACCESS.NOT_FOUND')
      report.checks.push(
        `${scope.type} 真实菜单／新增／编辑／预览、同编码隔离、版本冲突和历史值保护、外部用户拒绝访问`,
      )
    }
    const audits = await environment.query(
      "SELECT action FROM audit_logs WHERE action LIKE 'dictionary.%'",
    )
    assert(audits.rowCount >= 6, '创建与编辑应产生审计记录')
    report.checks.push('三范围真实写入均有数据库审计记录')
    await logout('company')
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(httpFailures, [])
    report.checks.push('企业账号退出后缓存及 Redis 会话清理，整个浏览器流程无页面异常或 HTTP 5xx')
    report.browserOptionRequests = optionsReads.length
  } catch (error) {
    report.pageErrors = pageErrors
    report.httpFailures = httpFailures
    report.failedPath = new URL(page.url()).pathname
    if (!report.failedPath.startsWith('/login')) {
      await capture('failure')
      report.document = environment.redact(await page.locator('body').innerText())
    }
    throw error
  } finally {
    await context.close()
  }
}
