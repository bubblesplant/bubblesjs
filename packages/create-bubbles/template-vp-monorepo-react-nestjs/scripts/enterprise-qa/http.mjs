import { existsSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  loadRuntime,
  databaseConfig,
  randomIdentity,
  ensure,
  privateStatePath,
  readPrivateState,
  writePrivateState,
  createReporter,
  serverRequire,
} from './runtime.mjs'
import {
  apiClient,
  registerIdentity,
  loginIdentity,
  runInitialization,
  flattenMenus,
  findMember,
} from './http-support.mjs'

const { runtime, runtimePath } = loadRuntime(process.argv[2])
ensure(runtime.database.database === 'enterprise_test', 'HTTP 验收只允许 enterprise_test')
const request = apiClient(runtime)
const statePath = privateStatePath(runtimePath, 'http')
const report = createReporter('http')
const { Client } = serverRequire('pg')
const db = new Client(databaseConfig(runtime))
const state = existsSync(statePath) ? readPrivateState(statePath) : {}
const suffix = randomBytes(4).toString('hex')
let accounts
let fixtures

function check(id, acceptance, run) {
  return report.check({ id, acceptance, run })
}

async function roleList({ actor, base }) {
  return (await request({ actor, path: `${base}/roles?pageSize=100` })).body.items
}

async function setStatus({ actor, path, current, status, expected = 200 }) {
  return (
    await request({
      actor,
      method: 'PATCH',
      path: `${path}/status`,
      body: { expectedVersion: current.version, status },
      expected,
    })
  ).body
}

/** 由企业管理员签发一次性邀请，并由目标账号接受以建立企业成员关系。 */
async function inviteCompanyMember({ administrator, member, base }) {
  const invitation = (
    await request({
      actor: administrator,
      path: `${base}/member-invitations`,
      method: 'POST',
      expected: 201,
      body: {},
    })
  ).body
  ensure(invitation.token, '企业成员邀请未返回一次性 token')
  await request({
    actor: member,
    path: '/company-member-invitations/accept',
    method: 'POST',
    expected: 200,
    body: { token: invitation.token },
  })
}

async function menuTree(scopeType) {
  return (
    await request({ actor: accounts.platform, path: `/platform/menus?scopeType=${scopeType}` })
  ).body
}

async function updateMenu({ scopeType, id, changes, expected = 200 }) {
  const tree = await menuTree(scopeType)
  return (
    await request({
      actor: accounts.platform,
      method: 'PATCH',
      path: `/platform/menus/${id}`,
      body: { expectedVersion: tree.version, ...changes },
      expected,
    })
  ).body
}

async function queuedWrites({ first, second }) {
  const blocker = new Client(databaseConfig(runtime))
  await blocker.connect()
  let firstPromise
  let secondPromise
  try {
    await blocker.query('BEGIN')
    await blocker.query('SELECT pg_advisory_xact_lock(7421, 1)')
    const waitForBlocked = async (count) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        const result = await db.query(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'",
        )
        if (result.rows[0].count >= count) return
        await delay(30)
      }
      throw new Error('未观察到 HTTP 管理写操作等待约定的 PostgreSQL advisory lock')
    }
    firstPromise = first()
    await waitForBlocked(1)
    secondPromise = second()
    await waitForBlocked(2)
    await blocker.query('COMMIT')
    return await Promise.all([firstPromise, secondPromise])
  } finally {
    await blocker.query('ROLLBACK').catch(() => {})
    await Promise.allSettled([firstPromise, secondPromise].filter(Boolean))
    await blocker.end()
  }
}

try {
  await db.connect()
  if (!state.platform) {
    const bootstrapped = await db.query('SELECT count(*)::int AS count FROM access_bootstrap')
    ensure(bootstrapped.rows[0].count === 0, '数据库已有未知首管理员，拒绝修改初始化或猜测测试凭据')
    state.platform = await registerIdentity({ request, identity: randomIdentity('platform') })
    writePrivateState(statePath, state)
  }
  const bootstrap = await db.query('SELECT count(*)::int AS count FROM access_bootstrap')
  if (bootstrap.rows[0].count === 0)
    runInitialization({ runtimePath, account: state.platform.account })
  await loginIdentity({ request, identity: state.platform })
  accounts = { platform: state.platform }
  for (const label of ['enterprise', 'project', 'member', 'other', 'empty', 'replacement']) {
    const identity = await registerIdentity({ request, identity: randomIdentity(label) })
    accounts[label] = await loginIdentity({ request, identity })
  }
  state.accounts = accounts
  writePrivateState(statePath, state)

  await check('http-empty-workspaces-and-platform-entry', ['AC-01'], async () => {
    const empty = (await request({ actor: accounts.empty, path: '/workspaces' })).body
    ensure(empty.workspaces.length === 0, '普通新账号被自动分配工作空间')
    const platform = (await request({ actor: accounts.platform, path: '/workspaces' })).body
    ensure(
      platform.workspaces.some((item) => item.scope.type === 'platform'),
      '无企业平台管理员缺少平台入口',
    )
    ensure(
      !platform.workspaces.some((item) => item.scope.type !== 'platform'),
      '平台管理员被自动加入企业',
    )
    await request({ path: '/workspaces', expected: 401 })
  })

  const company = (
    await request({
      actor: accounts.platform,
      path: '/platform/companies',
      method: 'POST',
      expected: 201,
      body: {
        name: `验收企业甲${suffix}`,
        code: `qa_a_${suffix}`,
        administratorUserId: accounts.enterprise.id,
      },
    })
  ).body
  const otherCompany = (
    await request({
      actor: accounts.platform,
      path: '/platform/companies',
      method: 'POST',
      expected: 201,
      body: {
        name: `验收企业乙${suffix}`,
        code: `qa_b_${suffix}`,
        administratorUserId: accounts.other.id,
      },
    })
  ).body
  const base = `/companies/${company.id}`
  const otherBase = `/companies/${otherCompany.id}`
  for (const user of [accounts.project, accounts.member]) {
    await inviteCompanyMember({ administrator: accounts.enterprise, member: user, base })
  }
  await inviteCompanyMember({
    administrator: accounts.other,
    member: accounts.enterprise,
    base: otherBase,
  })
  const project = (
    await request({
      actor: accounts.enterprise,
      path: `${base}/projects`,
      method: 'POST',
      expected: 201,
      body: {
        name: `验收项目甲${suffix}`,
        code: `project_a_${suffix}`,
        administratorUserId: accounts.project.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
  ).body
  const secondProject = (
    await request({
      actor: accounts.enterprise,
      path: `${base}/projects`,
      method: 'POST',
      expected: 201,
      body: {
        name: `验收项目乙${suffix}`,
        code: `project_b_${suffix}`,
        administratorUserId: accounts.project.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
  ).body
  const projectBase = `${base}/projects/${project.id}`
  const secondProjectBase = `${base}/projects/${secondProject.id}`
  await request({
    actor: accounts.project,
    path: `${projectBase}/members`,
    method: 'POST',
    expected: 201,
    body: { userId: accounts.member.id },
  })
  fixtures = {
    company,
    otherCompany,
    project,
    secondProject,
    base,
    otherBase,
    projectBase,
    secondProjectBase,
  }
  state.fixtures = fixtures
  writePrivateState(statePath, state)
  await check('http-create-company-project-transaction', ['AC-01'], async () => {
    const rows = await db.query(
      'SELECT count(*)::int AS count FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project.id, accounts.project.id],
    )
    ensure(rows.rows[0].count === 1, '创建项目未建立首位管理员成员关系')
    const failedCode = `failed_${suffix}`
    await request({
      actor: accounts.enterprise,
      path: `${base}/projects`,
      method: 'POST',
      expected: 422,
      body: {
        name: '应当回滚的项目',
        code: failedCode,
        administratorUserId: accounts.empty.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
    const failed = await db.query(
      'SELECT count(*)::int AS count FROM projects WHERE company_id = $1 AND code = $2',
      [company.id, failedCode],
    )
    ensure(failed.rows[0].count === 0, '失败项目创建留下部分项目记录')
  })

  await check('http-scope-isolation-and-implicit-administrator', ['AC-02'], async () => {
    await request({ actor: accounts.platform, path: `${base}/access`, expected: 404 })
    const implicit = (await request({ actor: accounts.enterprise, path: `${projectBase}/access` }))
      .body
    ensure(implicit.administrator === 'company', '企业管理员未取得隐式项目管理能力')
    const membership = await db.query(
      'SELECT count(*)::int AS count FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project.id, accounts.enterprise.id],
    )
    ensure(membership.rows[0].count === 0, '隐式项目管理被实现为自动创建成员')
    await request({ actor: accounts.member, path: `${projectBase}/access` })
    const foreign = await request({
      actor: accounts.member,
      path: `${otherBase}/access`,
      expected: 404,
    })
    const missing = await request({
      actor: accounts.member,
      path: `/companies/${randomUUID()}/access`,
      expected: 404,
    })
    ensure(
      foreign.body.code === missing.body.code && foreign.body.message === missing.body.message,
      '跨企业与不存在资源返回不一致',
    )
    await request({ actor: accounts.member, path: `${secondProjectBase}/access`, expected: 404 })
    await request({ actor: accounts.enterprise, path: otherBase, expected: 403 })
    const visible = (await request({ actor: accounts.member, path: `${base}/projects` })).body
    ensure(
      visible.items.length === 1 && visible.items[0].id === project.id,
      '普通成员项目列表泄漏未加入项目',
    )
  })

  await check('http-member-and-project-input-boundaries', ['AC-06', 'AC-11'], async () => {
    await request({
      actor: accounts.enterprise,
      path: `${base}/members`,
      method: 'POST',
      expected: 400,
      body: { account: accounts.member.account },
    })
    await request({
      actor: accounts.project,
      path: `${projectBase}/members`,
      method: 'POST',
      expected: 400,
      body: { account: accounts.empty.account },
    })
    await request({
      actor: accounts.member,
      path: `${base}/projects`,
      method: 'POST',
      expected: 403,
      body: {
        name: '越权项目',
        code: 'forbidden',
        administratorUserId: accounts.member.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
    await request({
      actor: accounts.project,
      path: `${base}/projects`,
      method: 'POST',
      expected: 403,
      body: {
        name: '越权项目',
        code: 'forbidden',
        administratorUserId: accounts.project.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/roles`,
      method: 'POST',
      expected: 400,
      body: {
        name: `不可下放${suffix}`,
        permissionKeys: ['company.projects.read', 'company.projects.create'],
      },
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/members?pageSize=101`,
      expected: 400,
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/members`,
      method: 'POST',
      expected: 400,
      body: { account: accounts.empty.account, companyId: otherCompany.id },
    })
  })

  const companyRoles = await roleList({ actor: accounts.enterprise, base })
  const builtinAdmin = companyRoles.find((role) => role.builtin === 'administrator')
  const builtinMember = companyRoles.find((role) => role.builtin === 'member')
  ensure(builtinAdmin && builtinMember, '缺少企业内置角色')
  let editableRole = (
    await request({
      actor: accounts.enterprise,
      path: `${base}/roles`,
      method: 'POST',
      expected: 201,
      body: {
        name: `资料编辑${suffix}`,
        permissionKeys: ['company.profile.read', 'company.profile.update'],
      },
    })
  ).body
  let ordinaryMember = await findMember({
    request,
    actor: accounts.enterprise,
    base,
    userId: accounts.member.id,
  })
  ordinaryMember = (
    await request({
      actor: accounts.enterprise,
      path: `${base}/members/${ordinaryMember.id}/roles`,
      method: 'PUT',
      body: {
        expectedVersion: ordinaryMember.version,
        roleIds: [builtinMember.id, editableRole.id],
      },
    })
  ).body

  await check('http-role-revoke-version-and-cross-scope', ['AC-04', 'AC-06'], async () => {
    await request({ actor: accounts.member, path: base })
    const oldVersion = editableRole.version
    editableRole = (
      await request({
        actor: accounts.enterprise,
        path: `${base}/roles/${editableRole.id}/permissions`,
        method: 'PUT',
        body: { expectedVersion: editableRole.version, permissionKeys: [] },
      })
    ).body
    await request({ actor: accounts.member, path: base, expected: 403 })
    await request({
      actor: accounts.enterprise,
      path: `${base}/roles/${editableRole.id}/permissions`,
      method: 'PUT',
      expected: 409,
      body: { expectedVersion: oldVersion, permissionKeys: ['company.profile.read'] },
    })
    const foreignRole = (await roleList({ actor: accounts.other, base: otherBase })).find(
      (role) => role.builtin === 'member',
    )
    ordinaryMember = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.member.id,
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/members/${ordinaryMember.id}/roles`,
      method: 'PUT',
      expected: 404,
      body: { expectedVersion: ordinaryMember.version, roleIds: [foreignRole.id] },
    })
    editableRole = (
      await request({
        actor: accounts.enterprise,
        path: `${base}/roles/${editableRole.id}/permissions`,
        method: 'PUT',
        body: {
          expectedVersion: editableRole.version,
          permissionKeys: ['company.profile.read', 'company.profile.update'],
        },
      })
    ).body
  })

  await check('http-builtin-roles-and-last-administrator', ['AC-06', 'AC-12'], async () => {
    await request({
      actor: accounts.enterprise,
      path: `${base}/roles/${builtinAdmin.id}`,
      method: 'PATCH',
      expected: 409,
      body: { expectedVersion: builtinAdmin.version, name: '不可编辑' },
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/roles/${builtinMember.id}/permissions`,
      method: 'PUT',
      expected: 409,
      body: { expectedVersion: builtinMember.version, permissionKeys: [] },
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/roles/${builtinAdmin.id}?expectedVersion=${builtinAdmin.version}`,
      method: 'DELETE',
      expected: 409,
    })
    const member = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.enterprise.id,
    })
    await setStatus({
      actor: accounts.enterprise,
      path: `${base}/members/${member.id}`,
      current: member,
      status: 'disabled',
      expected: 409,
    })
    await request({
      actor: accounts.enterprise,
      path: `${base}/members/${member.id}/roles`,
      method: 'PUT',
      expected: 409,
      body: { expectedVersion: member.version, roleIds: [builtinMember.id] },
    })
    await request({
      actor: accounts.platform,
      path: `/platform/accounts/${accounts.platform.id}/status`,
      method: 'PATCH',
      expected: 409,
      body: { status: 'disabled' },
    })
    await request({ actor: accounts.platform, path: '/auth/me' })
    await request({
      actor: accounts.platform,
      path: `/platform/accounts/${accounts.platform.id}/roles`,
      method: 'PUT',
      expected: 409,
      body: { roleIds: [] },
    })
  })
  await loginIdentity({ request, identity: accounts.platform })

  await check('http-menu-hidden-disabled-and-protected', ['AC-03', 'AC-06'], async () => {
    const tree = await menuTree('company')
    const profile = flattenMenus(tree.items).find(
      (item) => item.routeKey === 'company.profile' && item.type === 'page',
    )
    ensure(profile, '企业菜单缺少资料页面')
    try {
      await updateMenu({ scopeType: 'company', id: profile.id, changes: { hidden: true } })
      const context = (await request({ actor: accounts.enterprise, path: `${base}/access` })).body
      ensure(context.permissionKeys.includes('company.profile.read'), '隐藏菜单错误撤销权限')
      ensure(
        !flattenMenus(context.menus).some((item) => item.id === profile.id),
        '隐藏页面仍出现在导航',
      )
      await request({ actor: accounts.enterprise, path: base })
      await updateMenu({ scopeType: 'company', id: profile.id, changes: { status: 'disabled' } })
      await request({ actor: accounts.enterprise, path: base, expected: 403 })
      const platformMenus = await menuTree('platform')
      const protectedPage = flattenMenus(platformMenus.items).find(
        (item) => item.routeKey === 'platform.roles' && item.type === 'page',
      )
      await updateMenu({
        scopeType: 'platform',
        id: protectedPage.id,
        changes: { hidden: true },
        expected: 409,
      })
    } finally {
      await updateMenu({
        scopeType: 'company',
        id: profile.id,
        changes: { hidden: profile.hidden, status: profile.status },
      })
    }
  })

  await check('http-menu-ancestor-and-cycle-constraints', ['AC-03', 'AC-06'], async () => {
    let tree = await menuTree('company')
    const profile = flattenMenus(tree.items).find(
      (item) => item.routeKey === 'company.profile' && item.type === 'page',
    )
    tree = (
      await request({
        actor: accounts.platform,
        path: '/platform/menus?scopeType=company',
        method: 'POST',
        expected: 201,
        body: {
          expectedVersion: tree.version,
          type: 'directory',
          parentId: null,
          name: `验收目录${suffix}`,
        },
      })
    ).body
    const directory = flattenMenus(tree.items).find((item) => item.name === `验收目录${suffix}`)
    try {
      await updateMenu({
        scopeType: 'company',
        id: profile.id,
        changes: { parentId: directory.id },
      })
      await updateMenu({ scopeType: 'company', id: directory.id, changes: { status: 'disabled' } })
      await request({ actor: accounts.enterprise, path: base, expected: 403 })
      await updateMenu({
        scopeType: 'company',
        id: directory.id,
        changes: { parentId: directory.id },
        expected: 400,
      })
      tree = await menuTree('company')
      await request({
        actor: accounts.platform,
        path: `/platform/menus/${directory.id}?expectedVersion=${tree.version}`,
        method: 'DELETE',
        expected: 409,
      })
    } finally {
      await updateMenu({ scopeType: 'company', id: directory.id, changes: { status: 'active' } })
      await updateMenu({
        scopeType: 'company',
        id: profile.id,
        changes: { parentId: profile.parentId },
      })
      tree = await menuTree('company')
      await request({
        actor: accounts.platform,
        path: `/platform/menus/${directory.id}?expectedVersion=${tree.version}`,
        method: 'DELETE',
      })
    }
  })

  await check('http-status-preservation-and-member-reenable', ['AC-04', 'AC-09'], async () => {
    let member = await findMember({
      request,
      actor: accounts.project,
      base: projectBase,
      userId: accounts.member.id,
    })
    await setStatus({
      actor: accounts.project,
      path: `${projectBase}/members/${member.id}`,
      current: member,
      status: 'disabled',
    })
    let companyMember = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.member.id,
    })
    companyMember = await setStatus({
      actor: accounts.enterprise,
      path: `${base}/members/${companyMember.id}`,
      current: companyMember,
      status: 'disabled',
    })
    await request({ actor: accounts.member, path: `${base}/access`, expected: 403 })
    await setStatus({
      actor: accounts.enterprise,
      path: `${base}/members/${companyMember.id}`,
      current: companyMember,
      status: 'active',
    })
    await request({ actor: accounts.member, path: `${projectBase}/access`, expected: 403 })
    member = await findMember({
      request,
      actor: accounts.project,
      base: projectBase,
      userId: accounts.member.id,
    })
    ensure(member.status === 'disabled', '企业成员恢复错误启用了原停用项目成员')
    await setStatus({
      actor: accounts.project,
      path: `${projectBase}/members/${member.id}`,
      current: member,
      status: 'active',
    })
    const savedProject = (await request({ actor: accounts.enterprise, path: secondProjectBase }))
      .body
    await setStatus({
      actor: accounts.enterprise,
      path: secondProjectBase,
      current: savedProject,
      status: 'disabled',
    })
    let savedCompany = (
      await request({ actor: accounts.platform, path: `/platform/companies/${company.id}` })
    ).body
    savedCompany = await setStatus({
      actor: accounts.platform,
      path: `/platform/companies/${company.id}`,
      current: savedCompany,
      status: 'disabled',
    })
    await request({ actor: accounts.enterprise, path: `${projectBase}/access`, expected: 403 })
    await setStatus({
      actor: accounts.platform,
      path: `/platform/companies/${company.id}`,
      current: savedCompany,
      status: 'active',
    })
    await request({ actor: accounts.enterprise, path: `${projectBase}/access` })
    await request({
      actor: accounts.enterprise,
      path: `${secondProjectBase}/access`,
      expected: 403,
    })
    const items = (await request({ actor: accounts.enterprise, path: `${base}/projects` })).body
      .items
    const disabledProject = items.find((item) => item.id === secondProject.id)
    ensure(disabledProject.status === 'disabled', '企业恢复错误启用了原停用项目')
    await setStatus({
      actor: accounts.enterprise,
      path: secondProjectBase,
      current: disabledProject,
      status: 'active',
    })
  })

  await check(
    'http-account-disable-replacement-and-session-revocation',
    ['AC-04', 'AC-09', 'AC-10'],
    async () => {
      const oldSession = { accessToken: accounts.other.accessToken }
      await request({
        actor: accounts.platform,
        path: `/platform/accounts/${accounts.other.id}/status`,
        method: 'PATCH',
        body: { status: 'disabled' },
      })
      await request({ actor: oldSession, path: '/auth/me', expected: 401 })
      let target = (
        await request({ actor: accounts.platform, path: `/platform/companies/${otherCompany.id}` })
      ).body
      target = await setStatus({
        actor: accounts.platform,
        path: `/platform/companies/${otherCompany.id}`,
        current: target,
        status: 'disabled',
      })
      await setStatus({
        actor: accounts.platform,
        path: `/platform/companies/${otherCompany.id}`,
        current: target,
        status: 'active',
        expected: 409,
      })
      await request({
        actor: accounts.platform,
        path: `/platform/companies/${otherCompany.id}/administrator`,
        method: 'POST',
        body: {
          administratorUserId: accounts.replacement.id,
          replaceUserId: accounts.other.id,
        },
      })
      target = (
        await request({ actor: accounts.platform, path: `/platform/companies/${otherCompany.id}` })
      ).body
      ensure(target.status === 'disabled', '补任自动启用了企业')
      await setStatus({
        actor: accounts.platform,
        path: `/platform/companies/${otherCompany.id}`,
        current: target,
        status: 'active',
      })
      const context = (await request({ actor: accounts.replacement, path: `${otherBase}/access` }))
        .body
      ensure(context.administrator === 'company', '补任未授予有效企业管理员身份')
      await request({
        actor: accounts.platform,
        path: `/platform/accounts/${accounts.other.id}/status`,
        method: 'PATCH',
        body: { status: 'active' },
      })
      await request({ actor: oldSession, path: '/auth/me', expected: 401 })
      await loginIdentity({ request, identity: accounts.other })
      const previous = (await request({ actor: accounts.other, path: `${otherBase}/access` })).body
      ensure(previous.administrator === null, '被替换旧账号启用后恢复了原管理员身份')
    },
  )

  await check('http-audit-request-and-failure-atomicity', ['AC-07'], async () => {
    const detail = (await request({ actor: accounts.enterprise, path: base })).body
    const requestId = `qa-audit-${randomUUID()}`
    const response = await request({
      actor: accounts.enterprise,
      path: base,
      method: 'PATCH',
      requestId,
      body: { expectedVersion: detail.version, description: '独立 HTTP 审计验收' },
    })
    ensure(response.requestId, '成功响应缺少服务端请求ID')
    const rows = await db.query(
      'SELECT scope_type, action, summary FROM audit_logs WHERE request_id = $1',
      [response.requestId],
    )
    ensure(
      rows.rowCount === 1 && rows.rows[0].scope_type === 'company',
      '成功写入未产生同作用域单条审计',
    )
    ensure(
      !/password|accessToken|sessionPepper|authorization|cookie/i.test(
        JSON.stringify(rows.rows[0].summary),
      ),
      '审计摘要出现敏感字段',
    )
    const failureId = `qa-failed-${randomUUID()}`
    const rejected = await request({
      actor: accounts.enterprise,
      path: base,
      method: 'PATCH',
      requestId: failureId,
      expected: 409,
      body: { expectedVersion: detail.version, description: '不应提交' },
    })
    const failed = await db.query(
      'SELECT count(*)::int AS count FROM audit_logs WHERE request_id = $1',
      [rejected.requestId],
    )
    ensure(failed.rows[0].count === 0, '失败写操作留下成功审计')
    const platformAudit = (
      await request({ actor: accounts.platform, path: '/platform/audit-logs?pageSize=100' })
    ).body
    ensure(
      platformAudit.items.every((item) => item.scope.type === 'platform'),
      '平台审计包含企业内部事件',
    )
    const enterpriseAudit = (
      await request({ actor: accounts.enterprise, path: `${base}/audit-logs?pageSize=100` })
    ).body
    ensure(
      enterpriseAudit.items.every(
        (item) => item.scope.type !== 'platform' && item.scope.companyId === company.id,
      ),
      '企业审计越过作用域边界',
    )
  })

  await check('http-inflight-revocation-first', ['AC-15'], async () => {
    let member = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.member.id,
    })
    const detail = (await request({ actor: accounts.enterprise, path: base })).body
    const writeId = `qa-lock-denied-${randomUUID()}`
    const results = await queuedWrites({
      first: () =>
        request({
          actor: accounts.enterprise,
          path: `${base}/members/${member.id}/status`,
          method: 'PATCH',
          expected: null,
          body: { expectedVersion: member.version, status: 'disabled' },
        }),
      second: () =>
        request({
          actor: accounts.member,
          path: base,
          method: 'PATCH',
          expected: null,
          requestId: writeId,
          body: { expectedVersion: detail.version, description: '撤权之后不应写入' },
        }),
    })
    ensure(
      results[0].status === 200 && results[1].status === 403,
      '撤权先提交后，排队的 HTTP 写入未在锁内重新拒绝',
    )
    ensure(results[1].requestId, '并发拒绝响应缺少服务端请求ID')
    const audit = await db.query(
      'SELECT count(*)::int AS count FROM audit_logs WHERE request_id = $1',
      [results[1].requestId],
    )
    ensure(audit.rows[0].count === 0, '撤权后的失败写入留下成功审计')
    member = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.member.id,
    })
    await setStatus({
      actor: accounts.enterprise,
      path: `${base}/members/${member.id}`,
      current: member,
      status: 'active',
    })
  })

  await check('http-inflight-write-first', ['AC-15'], async () => {
    let member = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.member.id,
    })
    if (member.status !== 'active')
      member = await setStatus({
        actor: accounts.enterprise,
        path: `${base}/members/${member.id}`,
        current: member,
        status: 'active',
      })
    const detail = (await request({ actor: accounts.enterprise, path: base })).body
    const results = await queuedWrites({
      first: () =>
        request({
          actor: accounts.member,
          path: base,
          method: 'PATCH',
          expected: null,
          body: { expectedVersion: detail.version, description: '先取得锁的写操作提交' },
        }),
      second: () =>
        request({
          actor: accounts.enterprise,
          path: `${base}/members/${member.id}/status`,
          method: 'PATCH',
          expected: null,
          body: { expectedVersion: member.version, status: 'disabled' },
        }),
    })
    ensure(
      results.every((item) => item.status === 200),
      '写操作先持锁时未按约定先完成再撤权',
    )
    await request({ actor: accounts.member, path: base, expected: 403 })
    member = await findMember({
      request,
      actor: accounts.enterprise,
      base,
      userId: accounts.member.id,
    })
    await setStatus({
      actor: accounts.enterprise,
      path: `${base}/members/${member.id}`,
      current: member,
      status: 'active',
    })
  })

  await check('http-cleanup-preview-and-rejected-candidates', ['AC-14'], async () => {
    const preview = (
      await request({ actor: accounts.platform, path: '/platform/permissions/cleanup-preview' })
    ).body
    ensure(
      Array.isArray(preview.items) && preview.items.length === 0,
      '首版目录出现非预期废弃演示项',
    )
    await request({
      actor: accounts.empty,
      path: '/platform/permissions/cleanup-preview',
      expected: 403,
    })
    await request({
      actor: accounts.platform,
      path: '/platform/permissions/cleanup',
      method: 'POST',
      expected: 409,
      body: { permissionKeys: ['platform.companies.read'], proofDigest: 'a'.repeat(64) },
    })
    await request({
      actor: accounts.platform,
      path: '/platform/permissions/cleanup',
      method: 'POST',
      expected: 400,
      body: { permissionKeys: [], proofDigest: 'a'.repeat(64) },
    })
    return 'HTTP 空预览与非法清理拒绝；成功清理、回滚及 tombstone 另由后端受控真实 DB 测试证明'
  })

  await check('http-seed-repeat-preserves-configuration', ['AC-08', 'AC-12'], async () => {
    const profile = flattenMenus((await menuTree('company')).items).find(
      (item) => item.routeKey === 'company.profile' && item.type === 'page',
    )
    await updateMenu({
      scopeType: 'company',
      id: profile.id,
      changes: { name: `资料配置保留${suffix}`, hidden: true },
    })
    try {
      const assignmentsBefore = await db.query(
        'SELECT role_id FROM user_roles WHERE user_id = $1 ORDER BY role_id',
        [accounts.member.id],
      )
      runInitialization({ runtimePath, account: accounts.platform.account })
      const preserved = flattenMenus((await menuTree('company')).items).find(
        (item) => item.id === profile.id,
      )
      ensure(
        preserved.name === `资料配置保留${suffix}` && preserved.hidden,
        '重复初始化覆盖了管理员菜单配置',
      )
      const assignmentsAfter = await db.query(
        'SELECT role_id FROM user_roles WHERE user_id = $1 ORDER BY role_id',
        [accounts.member.id],
      )
      ensure(
        JSON.stringify(assignmentsBefore.rows) === JSON.stringify(assignmentsAfter.rows),
        '重复初始化改变用户角色分配',
      )
      runInitialization({ runtimePath, account: accounts.empty.account, expectedSuccess: false })
      const empty = (await request({ actor: accounts.empty, path: '/workspaces' })).body
      ensure(empty.workspaces.length === 0, '重复初始化向其他账号提权')
    } finally {
      await updateMenu({
        scopeType: 'company',
        id: profile.id,
        changes: { name: profile.name, hidden: profile.hidden },
      })
    }
  })

  await check('http-upload-owner-regression', ['AC-08'], async () => {
    const upload = (
      await request({
        actor: accounts.member,
        path: '/uploads/multipart',
        method: 'POST',
        expected: 201,
        body: {
          clientUploadId: randomUUID(),
          fileName: 'qa.txt',
          fileSize: 4,
          contentType: 'text/plain',
        },
      })
    ).body
    const id = upload.uploadSessionId ?? upload.id
    ensure(typeof id === 'string', '上传初始化响应缺少上传会话 ID')
    await request({ actor: accounts.empty, path: `/uploads/multipart/${id}`, expected: 404 })
    await request({
      actor: accounts.member,
      path: `/uploads/multipart/${id}/parts/1`,
      method: 'PUT',
      body: 'test',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '4' },
    })
    await request({
      actor: accounts.member,
      path: `/uploads/multipart/${id}/complete`,
      method: 'POST',
    })
    const stored = await db.query('SELECT owner_id, status FROM upload_sessions WHERE id = $1', [
      id,
    ])
    ensure(
      stored.rows[0]?.owner_id === accounts.member.id && stored.rows[0]?.status === 'completed',
      '上传 ownerId 或完成状态回归失败',
    )
  })

  await check(
    'http-enterprise-member-removal-cleans-children',
    ['AC-04', 'AC-06', 'AC-09'],
    async () => {
      const member = await findMember({
        request,
        actor: accounts.enterprise,
        base,
        userId: accounts.member.id,
      })
      await request({
        actor: accounts.enterprise,
        path: `${base}/members/${member.id}?expectedVersion=${member.version}`,
        method: 'DELETE',
      })
      const child = await db.query(
        'SELECT count(*)::int AS count FROM project_members WHERE company_id = $1 AND user_id = $2',
        [company.id, accounts.member.id],
      )
      ensure(child.rows[0].count === 0, '移除企业成员未清理项目关系')
      await request({ actor: accounts.member, path: `${projectBase}/access`, expected: 404 })
      await inviteCompanyMember({
        administrator: accounts.enterprise,
        member: accounts.member,
        base,
      })
      const restored = await findMember({
        request,
        actor: accounts.enterprise,
        base,
        userId: accounts.member.id,
      })
      ensure(
        restored.roleIds.length === 1 && restored.roleIds[0] === builtinMember.id,
        '重新添加恢复了已清理的旧授权',
      )
      await request({
        actor: accounts.project,
        path: `${projectBase}/members`,
        method: 'POST',
        expected: 201,
        body: { userId: accounts.member.id },
      })
    },
  )

  state.accounts = accounts
  state.fixtures = fixtures
  writePrivateState(statePath, state)
} catch (error) {
  report.results.push({
    id: 'http-setup-or-run',
    acceptance: ['AC-01'],
    status: 'failed',
    evidence: error instanceof Error ? error.message : 'HTTP 验收失败',
  })
  process.stdout.write('FAIL http-setup-or-run\n')
} finally {
  if (accounts) state.accounts = accounts
  if (fixtures) state.fixtures = fixtures
  writePrivateState(statePath, state)
  await db.end().catch(() => {})
  report.save()
  if (report.results.some((item) => item.status === 'failed')) process.exitCode = 1
}
