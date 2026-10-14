import { describe, expect, it, vi } from 'vite-plus/test'
import { buildAuthPath, safeNextPath } from '../../src/utils/safe-next'

vi.mock('../../src/router/lazy-load', () => ({ lazyLoad: () => null }))
import { authRoutes } from '../../src/router/modules/auth'

describe('认证入口与站内返回路径', () => {
  it('只注册登录、注册入口，撤下邀请接受页面', () => {
    expect(authRoutes.map((route) => route.path)).toEqual(['/login', '/register'])
  })
  it('拒绝外站及反斜杠返回目标', () => {
    const next = '/workspaces?type=company'
    expect(safeNextPath(next)).toBe(next)
    expect(safeNextPath('https://example.com/steal')).toBe('/')
    expect(safeNextPath('//example.com/steal')).toBe('/')
    expect(safeNextPath('/\\example.com/steal')).toBe('/')
    expect(safeNextPath(undefined, '/workspaces')).toBe('/workspaces')
  })
  it('登录和注册之间保留安全的站内返回路径', () => {
    const next = '/workspaces?type=company'
    const url = new URL(buildAuthPath('/login', { next, registered: true }), 'https://wanwu.test')
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe(next)
    expect(url.searchParams.get('registered')).toBe('1')
    expect(buildAuthPath('/register', { next: 'https://example.com' })).toBe('/register')
  })
})
