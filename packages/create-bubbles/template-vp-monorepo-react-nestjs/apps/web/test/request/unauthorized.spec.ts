// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { cookie } from '../../src/utils/storage/cookie'

const effects = vi.hoisted(() => ({
  loadRouter: vi.fn(),
  navigate: vi.fn(),
  errorMessage: vi.fn(),
}))

vi.mock('../../src/router', () => {
  effects.loadRouter()
  return { navigator: effects.navigate }
})
vi.mock('antd', () => ({ message: { error: effects.errorMessage } }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  // happy-dom 在同一毫秒内暂留零秒 Cookie；递增时钟使删除具有浏览器的立即过期语义。
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now++)
  localStorage.clear()
  sessionStorage.clear()
  cookie.set('token', 'session-one')
})

afterEach(() => {
  cookie.remove('token')
})

describe('登录失效处理的路由依赖', () => {
  it('相同令牌写入不通知，有令牌或无令牌删除都只通知一次', () => {
    const changed = vi.fn()
    window.addEventListener('auth-session-change', changed)
    try {
      cookie.set('token', 'session-one')
      expect(changed).not.toHaveBeenCalled()
      cookie.remove('token')
      expect(cookie.get('token')).toBeNull()
      expect(changed).toHaveBeenCalledOnce()
      cookie.remove('token')
      expect(cookie.get('token')).toBeNull()
      expect(changed).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener('auth-session-change', changed)
    }
  })

  it('加载请求工具时不初始化路由，首次失效后才加载且重复失效仅提示导航一次', async () => {
    const { unAuthorizedResponseFunc } = await import('../../src/utils/request/utils')
    expect(effects.loadRouter).not.toHaveBeenCalled()

    unAuthorizedResponseFunc()
    unAuthorizedResponseFunc()
    expect(effects.errorMessage).toHaveBeenCalledExactlyOnceWith('登录过期或未登录')

    await vi.waitFor(() => {
      expect(effects.loadRouter).toHaveBeenCalledOnce()
      expect(effects.navigate).toHaveBeenCalledExactlyOnceWith('/login')
    })

    unAuthorizedResponseFunc()
    expect(effects.errorMessage).toHaveBeenCalledOnce()
    expect(effects.navigate).toHaveBeenCalledOnce()
  })

  it('未加载业务 store 也删除会话快照，保留语言、主题和草稿', async () => {
    localStorage.setItem('workspace-display-cache', 'old workspace snapshot')
    sessionStorage.setItem('bubbles.dictionary-cache', 'old dictionary snapshot')
    localStorage.setItem('language', 'zh-CN')
    localStorage.setItem('theme', 'dark')
    sessionStorage.setItem('draft', '尚未提交的表单')
    const changed = vi.fn()
    window.addEventListener('auth-session-change', changed)
    try {
      const { unAuthorizedResponseFunc } = await import('../../src/utils/request/utils')
      unAuthorizedResponseFunc()
      unAuthorizedResponseFunc()

      expect(cookie.get('token')).toBeNull()
      expect(changed).toHaveBeenCalledOnce()
      expect(localStorage.getItem('workspace-display-cache')).toBeNull()
      expect(sessionStorage.getItem('bubbles.dictionary-cache')).toBeNull()
      expect(localStorage.getItem('language')).toBe('zh-CN')
      expect(localStorage.getItem('theme')).toBe('dark')
      expect(sessionStorage.getItem('draft')).toBe('尚未提交的表单')
      expect(effects.errorMessage).toHaveBeenCalledOnce()
      await vi.waitFor(() => expect(effects.navigate).toHaveBeenCalledExactlyOnceWith('/login'))
    } finally {
      window.removeEventListener('auth-session-change', changed)
    }
  })

  it('令牌已自然过期时仍补发一次清理事件', async () => {
    document.cookie = 'token=; Max-Age=0; Path=/'
    expect(cookie.get('token')).toBeNull()
    const changed = vi.fn()
    window.addEventListener('auth-session-change', changed)
    try {
      const { unAuthorizedResponseFunc } = await import('../../src/utils/request/utils')
      unAuthorizedResponseFunc()
      unAuthorizedResponseFunc()
      expect(changed).toHaveBeenCalledOnce()
      await vi.waitFor(() => expect(effects.navigate).toHaveBeenCalledExactlyOnceWith('/login'))
    } finally {
      window.removeEventListener('auth-session-change', changed)
    }
  })
})
