import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { getBuiltinPermissionKeys } from 'shared/utils'
import {
  access,
  api,
  companyScope,
  makeRouter,
  projectPath,
  projectScope,
  resetPolicyData,
  session,
  setAccess,
  setWorkspaces,
  workspace,
} from './config'

beforeEach(resetPolicyData)

describe('默认入口 middleware 分流', () => {
  it.each(['/', '/home'])('只有一个项目时从 %s 直接进入项目', async (entry) => {
    setWorkspaces([workspace(projectScope)])
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate(entry)
      expect(fixture.router.state.location.pathname).toBe(projectPath)
      expect(fixture.router.state.errors).toBeNull()
      expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
    } finally {
      fixture.dispose()
    }
  })

  it('普通企业成员的默认权限不会阻止唯一项目直达', async () => {
    setWorkspaces([workspace(companyScope), workspace(projectScope)])
    setAccess([
      access(companyScope, {
        permissionKeys: getBuiltinPermissionKeys({ scopeType: 'company', builtin: 'member' }),
      }),
    ])
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/')
      expect(fixture.router.state.location.pathname).toBe(projectPath)
      expect(api.getAccessContext).toHaveBeenNthCalledWith(1, companyScope, {
        workspaceKey: 'workspaces',
        signal: expect.any(AbortSignal),
      })
      expect(api.getAccessContext).toHaveBeenNthCalledWith(2, projectScope, {
        workspaceKey: 'workspaces',
        signal: expect.any(AbortSignal),
      })
      expect(api.getAccessContext).toHaveBeenNthCalledWith(3, projectScope, {
        workspaceKey: 'project:company-a:project-a',
        signal: expect.any(AbortSignal),
      })
    } finally {
      fixture.dispose()
    }
  })

  it.each([
    {
      name: '平台身份',
      entries: [workspace({ type: 'platform' }, 'platform'), workspace(projectScope)],
    },
    { name: '企业管理员', entries: [workspace(companyScope, 'company'), workspace(projectScope)] },
    {
      name: '多个项目',
      entries: [workspace(projectScope), workspace({ ...projectScope, projectId: 'project-b' })],
    },
    { name: '没有项目', entries: [workspace(companyScope)] },
    { name: '没有空间', entries: [] },
  ])('$name 进入工作空间选择', async ({ entries }) => {
    setWorkspaces(entries)
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/')
      expect(fixture.router.state.location.pathname).toBe('/workspaces')
      expect(fixture.workspaces()?.workspaces).toEqual(entries)
      expect(api.getAccessContext).not.toHaveBeenCalled()
    } finally {
      fixture.dispose()
    }
  })

  it.each([
    {
      name: '自定义企业管理权限',
      context: access(companyScope, {
        permissionKeys: ['company.home.read', 'company.members.read'],
      }),
    },
    { name: '权限响应标记企业管理员', context: access(companyScope, { administrator: 'company' }) },
  ])('$name 保留工作空间选择', async ({ context }) => {
    setWorkspaces([workspace(companyScope), workspace(projectScope)])
    setAccess([context])
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/')
      expect(fixture.router.state.location.pathname).toBe('/workspaces')
      expect(api.getAccessContext).toHaveBeenCalledTimes(1)
    } finally {
      fixture.dispose()
    }
  })

  it('唯一项目首页不可见时直接进入另一个已授权页面', async () => {
    setWorkspaces([workspace(projectScope)])
    setAccess([access(projectScope, { permissionKeys: ['project.members.read'] })])
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/')
      expect(fixture.router.state.location.pathname).toBe(`${projectPath}/members`)
      expect(fixture.router.state.errors).toBeNull()
    } finally {
      fixture.dispose()
    }
  })

  it('唯一项目无任何可访问页面时回到选择页', async () => {
    setWorkspaces([workspace(projectScope)])
    setAccess([access(projectScope, { permissionKeys: [] })])
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/')
      expect(fixture.router.state.location.pathname).toBe('/workspaces')
    } finally {
      fixture.dispose()
    }
  })

  it.each([403, 404])('自动选择期间身份失效 %s 时重新获取选择页列表', async (status) => {
    setWorkspaces([workspace(projectScope)])
    api.getAccessContext.mockRejectedValue(Object.assign(new Error('项目身份失效'), { status }))
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/')
      expect(fixture.router.state.location.pathname).toBe('/workspaces')
      expect(fixture.router.state.errors).toBeNull()
      expect(api.getWorkspaces).toHaveBeenCalledTimes(2)
    } finally {
      fixture.dispose()
    }
  })

  it.each(['/workspaces', '/companies/company-a', `${projectPath}/members`])(
    '显式进入 %s 不触发默认分流',
    async (destination) => {
      setWorkspaces([workspace(companyScope), workspace(projectScope)])
      setAccess([access(projectScope, { permissionKeys: ['project.members.read'] })])
      const fixture = await makeRouter()
      try {
        await fixture.router.navigate(destination)
        expect(fixture.router.state.location.pathname).toBe(destination)
        expect(fixture.router.state.errors).toBeNull()
        expect(api.getWorkspaces).toHaveBeenCalledTimes(1)
        expect(api.getAccessContext).toHaveBeenCalledTimes(destination === '/workspaces' ? 0 : 1)
      } finally {
        fixture.dispose()
      }
    },
  )

  it.each(['/', '/home', '/workspaces', projectPath])(
    '未登录访问 %s 时不请求工作空间数据',
    async (destination) => {
      session.token = null
      const fixture = await makeRouter()
      try {
        await fixture.router.navigate(destination)
        expect(fixture.router.state.location.pathname).toBe('/login')
        expect(api.getWorkspaces).not.toHaveBeenCalled()
        expect(api.getAccessContext).not.toHaveBeenCalled()
      } finally {
        fixture.dispose()
      }
    },
  )
})
