import { beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  access,
  api,
  makeRouter,
  resetPolicyData,
  setAccess,
  setWorkspaces,
  workspace,
} from './config'

beforeEach(() => {
  resetPolicyData()
  setWorkspaces([workspace({ type: 'platform' }, 'platform')])
  setAccess([
    access(
      { type: 'platform' },
      { administrator: 'platform', permissionKeys: ['platform.menus.read'] },
    ),
  ])
})

describe('工作空间与页面权限 middleware', () => {
  it('叶子页面 403 保留已验证的父级空间，并允许继续进入有权页面', async () => {
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform/accounts')
      expect(fixture.router.state.errors?.['platform.accounts']).toMatchObject({ status: 403 })
      expect(fixture.access({ type: 'platform' })).toMatchObject({
        permissionKeys: ['platform.menus.read'],
        workspace: { scope: { type: 'platform' } },
      })
      await fixture.router.navigate('/platform/menus')
      expect(fixture.router.state.errors).toBeNull()
      expect(fixture.access({ type: 'platform' })?.permissionKeys).toEqual(['platform.menus.read'])
    } finally {
      fixture.dispose()
    }
  })

  it('首页撤权时跳到其他已授权静态页面', async () => {
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform')
      expect(fixture.router.state.location.pathname).toBe('/platform/menus')
      expect(fixture.router.state.errors).toBeNull()
      expect(fixture.access({ type: 'platform' })?.scope).toEqual({ type: 'platform' })
    } finally {
      fixture.dispose()
    }
  })

  it('没有已授权页面时显示 403 且不会循环跳转', async () => {
    setAccess([access({ type: 'platform' }, { permissionKeys: [] })])
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform')
      expect(fixture.router.state.location.pathname).toBe('/platform')
      expect(fixture.router.state.errors?.['platform.home']).toMatchObject({ status: 403 })
      expect(api.getAccessContext).toHaveBeenCalledTimes(1)
    } finally {
      fixture.dispose()
    }
  })

  it('整个作用域失效时清除当前权限上下文', async () => {
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform/menus')
      api.getAccessContext.mockRejectedValue(
        Object.assign(new Error('身份已撤销'), { status: 403 }),
      )
      await fixture.router.navigate('/platform/accounts')
      expect(Object.values(fixture.router.state.errors ?? {})).toEqual([
        expect.objectContaining({ status: 403 }),
      ])
      expect(fixture.access({ type: 'platform' })).toBeUndefined()
    } finally {
      fixture.dispose()
    }
  })

  it('父级与叶子共享一次权限请求，每次导航重新校验', async () => {
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform/menus')
      expect(api.getAccessContext).toHaveBeenCalledTimes(1)
      expect(api.getWorkspaces).toHaveBeenCalledTimes(1)
      await fixture.router.navigate('/platform/accounts')
      expect(api.getAccessContext).toHaveBeenCalledTimes(2)
      expect(api.getWorkspaces).toHaveBeenCalledTimes(1)
    } finally {
      fixture.dispose()
    }
  })

  it('重新校验读取最新权限，叶子被撤权后仍保留有效父级空间', async () => {
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform/menus')
      setAccess([
        access(
          { type: 'platform' },
          { permissionKeys: ['platform.accounts.read'], menuVersion: 2 },
        ),
      ])
      await fixture.router.revalidate()
      expect(api.getAccessContext).toHaveBeenCalledTimes(2)
      expect(api.getWorkspaces).toHaveBeenCalledTimes(1)
      expect(fixture.router.state.errors?.['platform.menus']).toMatchObject({ status: 403 })
      expect(fixture.access({ type: 'platform' })).toMatchObject({
        permissionKeys: ['platform.accounts.read'],
        menuVersion: 2,
      })
    } finally {
      fixture.dispose()
    }
  })

  it('重新校验发现身份撤销时丢弃旧权限', async () => {
    const fixture = await makeRouter()
    try {
      await fixture.router.navigate('/platform/menus')
      api.getAccessContext.mockRejectedValue(
        Object.assign(new Error('身份已撤销'), { status: 403 }),
      )
      await fixture.router.revalidate()
      expect(Object.values(fixture.router.state.errors ?? {})).toEqual([
        expect.objectContaining({ status: 403 }),
      ])
      expect(fixture.access({ type: 'platform' })).toBeUndefined()
    } finally {
      fixture.dispose()
    }
  })
})
