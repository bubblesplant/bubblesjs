import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { AccessContext } from 'shared/types'
import {
  access,
  api,
  makeRouter,
  projectPath,
  projectScope,
  resetPolicyData,
  session,
  setWorkspaces,
  workspace,
} from './config'

let fixture: Awaited<ReturnType<typeof makeRouter>>
beforeEach(async () => {
  resetPolicyData()
  setWorkspaces([workspace(projectScope)])
  fixture = await makeRouter()
})
afterEach(() => fixture?.dispose())

describe('工作空间数据交接', () => {
  it('切换项目等待期间保留原项目权限，完成后按新项目读取且无需 loader', async () => {
    await fixture.router.navigate(projectPath)
    api.getAccessContext.mockClear()
    api.getWorkspaces.mockClear()
    const nextScope = { ...projectScope, projectId: 'project-b' }
    const nextWorkspaceKey = 'project:company-a:project-b'
    let resolve!: (value: AccessContext) => void
    api.getAccessContext.mockImplementationOnce(
      () =>
        new Promise<AccessContext>((done) => {
          resolve = done
        }),
    )
    const navigation = fixture.router.navigate('/companies/company-a/projects/project-b')
    await vi.waitFor(() => expect(resolve).toBeDefined())
    expect(api.getAccessContext).toHaveBeenCalledWith(nextScope, {
      workspaceKey: nextWorkspaceKey,
      signal: expect.any(AbortSignal),
    })
    expect(api.getWorkspaces).toHaveBeenCalledWith({
      workspaceKey: nextWorkspaceKey,
      signal: expect.any(AbortSignal),
    })
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
    expect(fixture.access(nextScope)).toBeUndefined()
    resolve(access(nextScope))
    await navigation
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
    expect(fixture.access(nextScope)?.scope).toEqual(nextScope)
    expect(fixture.router.state.errors).toBeNull()
    expect(fixture.router.state.loaderData).toEqual({})
  })

  it('同位置撤销空间身份后清除权限，重新校验成功可以恢复', async () => {
    await fixture.router.navigate(projectPath)
    const key = fixture.router.state.location.key
    api.getAccessContext.mockRejectedValueOnce(
      Object.assign(new Error('身份已撤销'), { status: 403 }),
    )
    await fixture.router.revalidate()
    expect(fixture.access(projectScope)).toBeUndefined()
    expect(Object.values(fixture.router.state.errors ?? {})).toEqual([
      expect.objectContaining({ status: 403 }),
    ])
    await fixture.router.revalidate()
    expect(fixture.router.state.location.key).toBe(key)
    expect(fixture.router.state.errors).toBeNull()
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
  })

  it('取消刷新不会清掉已经验证的空间权限', async () => {
    await fixture.router.navigate(projectPath)
    api.getAccessContext.mockRejectedValueOnce(new DOMException('请求已取消', 'AbortError'))
    await fixture.router.revalidate()
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
  })

  it('更换账号后不再读取原账号的列表与空间权限', async () => {
    await fixture.router.navigate('/workspaces')
    await fixture.router.navigate(projectPath)
    session.token = 'another-account'
    expect(fixture.workspaces()).toBeUndefined()
    expect(fixture.access(projectScope)).toBeUndefined()
    await fixture.router.revalidate()
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
  })

  it('Hash 导航仍可读取当前空间，查询参数变化重新取权限', async () => {
    await fixture.router.navigate(projectPath)
    await fixture.router.navigate(`${projectPath}#section`)
    expect(api.getAccessContext).toHaveBeenCalledTimes(1)
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
    await fixture.router.navigate(`${projectPath}?view=details#section`)
    expect(api.getAccessContext).toHaveBeenCalledTimes(2)
    expect(fixture.access(projectScope)?.scope).toEqual(projectScope)
  })

  it('列表刷新失败不保留旧列表，重试后可显示最新空列表', async () => {
    await fixture.router.navigate('/workspaces')
    expect(fixture.workspaces()?.workspaces).toHaveLength(1)
    api.getWorkspaces.mockRejectedValueOnce(new Error('列表获取失败'))
    await fixture.router.revalidate()
    expect(fixture.workspaces()).toBeUndefined()
    setWorkspaces([])
    await fixture.router.revalidate()
    expect(fixture.router.state.errors).toBeNull()
    expect(fixture.workspaces()?.workspaces).toEqual([])
  })
})
