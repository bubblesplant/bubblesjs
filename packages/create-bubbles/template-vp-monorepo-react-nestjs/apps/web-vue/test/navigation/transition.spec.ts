// @vitest-environment happy-dom

import type { MockInstance } from 'vite-plus/test'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  createMemoryHistory,
  createRouter,
  isNavigationFailure,
  NavigationFailureType,
} from 'vue-router'
import { createRouteTransition } from '@/router/transition'

/** 独立控制快照就绪与完成，避免单测依赖浏览器动画时钟。 */
function deferred() {
  let resolve!: () => void
  let reject!: (cause: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/** 保留真实更新回调的等待关系，快照完成由测试单独放行。 */
function controlledTransition(update: () => void | Promise<void>) {
  const ready = deferred()
  const finished = deferred()
  const updateDone = deferred()
  let updating: Promise<void> | undefined
  return {
    region: document.documentElement.dataset.routeTransition,
    ready,
    finished,
    value: {
      ready: ready.promise,
      finished: finished.promise,
      updateCallbackDone: updateDone.promise,
      skipTransition: vi.fn(),
      types: new Set<string>(),
    } satisfies ViewTransition,
    /** 模拟浏览器取得旧页面快照后执行更新，重复调用复用原更新。 */
    runUpdate() {
      updating ??= Promise.resolve(update()).then(updateDone.resolve)
      return updating
    },
  }
}

type ControlledTransition = ReturnType<typeof controlledTransition>
const placeholder = { render: () => null }
const routers: Router[] = []
const errorSpies = new WeakMap<Router, MockInstance<Router['onError']>>()
let transitions: ControlledTransition[] = []
let frames: FrameRequestCallback[] = []
let reducedMotion = false
let startDescriptor: PropertyDescriptor | undefined
const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
  const transition = controlledTransition(update)
  transitions.push(transition)
  return transition.value
})

/** 只替换当前文档的浏览器能力，结束后恢复原有属性。 */
function setStartViewTransition(value: unknown) {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value })
}

/** 安装真实导航守卫，并使用虚构空间路由完成首次进入。 */
async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: placeholder },
      { path: '/register', component: placeholder },
      { path: '/workspaces', component: placeholder },
      { path: '/platform', component: placeholder, meta: { scopeType: 'platform' } },
      { path: '/platform/members', component: placeholder, meta: { scopeType: 'platform' } },
      { path: '/companies/:companyId', component: placeholder, meta: { scopeType: 'company' } },
      {
        path: '/companies/:companyId/members',
        component: placeholder,
        meta: { scopeType: 'company' },
      },
      {
        path: '/companies/:companyId/projects/:projectId',
        component: placeholder,
        meta: { scopeType: 'project' },
      },
      {
        path: '/companies/:companyId/projects/:projectId/members',
        component: placeholder,
        meta: { scopeType: 'project' },
      },
      { path: '/examples/:page', component: placeholder },
      { path: '/:pathMatch(.*)*', component: placeholder },
    ],
  })
  routers.push(router)
  errorSpies.set(router, vi.spyOn(router, 'onError'))
  createRouteTransition(router)
  await router.push(path)
  await router.isReady()
  return router
}

/** 等到导航进入快照守卫，保留尚未完成的导航供测试推进。 */
async function beginNavigation(router: Router, path: string) {
  const index = transitions.length
  const navigation = router.push(path)
  await vi.waitFor(() => expect(transitions).toHaveLength(index + 1), { interval: 1 })
  return { navigation, control: transitions[index]! }
}

/** 依序提交导航、等待页面更新并结束快照，供区域选择用例复用。 */
async function finishNavigation({
  navigation,
  control,
}: Awaited<ReturnType<typeof beginNavigation>>) {
  const updating = control.runUpdate()
  await navigation
  await updating
  control.ready.resolve()
  control.finished.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  transitions = []
  frames = []
  reducedMotion = false
  startDescriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  startViewTransition.mockReset()
  startViewTransition.mockImplementation((update) => {
    const transition = controlledTransition(update)
    transitions.push(transition)
    return transition.value
  })
  setStartViewTransition(startViewTransition)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: reducedMotion }) as MediaQueryList,
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  delete document.documentElement.dataset.routeTransition
})

afterEach(async () => {
  setStartViewTransition(undefined)
  await Promise.all(routers.splice(0).map((router) => router.push('/cleanup')))
  await Promise.all(transitions.map((transition) => transition.runUpdate()))
  for (const transition of transitions) {
    transition.ready.resolve()
    transition.finished.resolve()
  }
  await Promise.resolve()
  if (startDescriptor) Object.defineProperty(document, 'startViewTransition', startDescriptor)
  else Reflect.deleteProperty(document, 'startViewTransition')
  delete document.documentElement.dataset.routeTransition
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('路由转场', () => {
  it('首次进入不播放，导航仅等待更新入口放行，快照等待页面提交', async () => {
    const router = await routerAt('/login')
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()

    const pending = await beginNavigation(router, '/register')
    expect(router.currentRoute.value.path).toBe('/login')
    let updated = false
    const updating = pending.control.runUpdate().then(() => {
      updated = true
    })
    expect(updated).toBe(false)
    await pending.navigation
    expect(router.currentRoute.value.path).toBe('/register')
    expect(document.documentElement.dataset.routeTransition).toBe('layout')
    await updating
    expect(updated).toBe(true)
    expect(document.documentElement.dataset.routeTransition).toBe('layout')
    pending.control.finished.resolve()
    await Promise.resolve()
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()
  })

  it('快照暂停动画帧时仍完成更新，不等待 requestAnimationFrame', async () => {
    const router = await routerAt('/login')
    const pending = await beginNavigation(router, '/register')
    let updated = false
    const updating = pending.control.runUpdate().then(() => {
      updated = true
    })
    await pending.navigation
    await vi.waitFor(() => expect(updated).toBe(true), { interval: 1 })
    expect(frames).toHaveLength(0)
    await updating
    expect(router.currentRoute.value.path).toBe('/register')
    expect(pending.control.value.skipTransition).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.routeTransition).toBe('layout')
  })

  it.each([
    ['/platform', '/platform/members', 'page'],
    ['/companies/demo-a', '/companies/demo-a/members', 'page'],
    [
      '/companies/demo-a/projects/project-a',
      '/companies/demo-a/projects/project-a/members',
      'page',
    ],
    ['/examples/first', '/examples/second', 'page'],
    ['/login', '/workspaces', 'layout'],
    ['/workspaces', '/companies/demo-a', 'layout'],
    ['/companies/demo-a', '/companies/demo-b', 'layout'],
    ['/companies/demo-a', '/companies/demo-a/projects/project-a', 'layout'],
    ['/companies/demo-a/projects/project-a', '/companies/demo-a/projects/project-b', 'layout'],
  ])('%s → %s 选择 %s 区域', async (from, to, expectedRegion) => {
    const router = await routerAt(from)
    const pending = await beginNavigation(router, to)
    expect(pending.control.region).toBe(expectedRegion)
    await finishNavigation(pending)
    expect(router.currentRoute.value.path).toBe(to)
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()
  })

  it('快速导航释放旧守卫，旧取消通知、旧错误与旧动画完成均不清除新导航', async () => {
    const router = await routerAt('/login')
    let firstTarget!: RouteLocationNormalized
    router.beforeEach((to) => {
      if (to.path === '/register') firstTarget = to
    })
    const first = await beginNavigation(router, '/register')
    const second = await beginNavigation(router, '/workspaces')
    const firstFailure = await first.navigation
    expect(isNavigationFailure(firstFailure, NavigationFailureType.cancelled)).toBe(true)
    expect(first.control.value.skipTransition).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(document.documentElement.dataset.routeTransition).toBe('layout')

    // 使用真实旧导航对象触发迟到错误，不能误取消当前空间导航。
    const onError = errorSpies.get(router)!.mock.calls[0]![0]
    onError(new Error('旧导航延迟错误'), firstTarget, router.currentRoute.value)
    first.control.finished.resolve()
    await first.control.runUpdate()
    await Promise.resolve()
    expect(second.control.value.skipTransition).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.routeTransition).toBe('layout')
    await finishNavigation(second)
    expect(router.currentRoute.value.path).toBe('/workspaces')
  })

  it('重复导航的失败通知不清除已经提交但尚未结束的动画', async () => {
    const router = await routerAt('/login')
    const pending = await beginNavigation(router, '/register')
    const updating = pending.control.runUpdate()
    await pending.navigation
    await updating
    const duplicate = await router.push('/register')
    expect(isNavigationFailure(duplicate, NavigationFailureType.duplicated)).toBe(true)
    expect(pending.control.value.skipTransition).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.routeTransition).toBe('layout')
    pending.control.finished.resolve()
    await Promise.resolve()
    expect(router.currentRoute.value.path).toBe('/register')
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()
  })

  it('后续守卫取消导航时释放更新等待，下一次导航可以正常提交', async () => {
    const router = await routerAt('/login')
    router.beforeResolve((to) => to.path !== '/register')
    const pending = await beginNavigation(router, '/register')
    const updating = pending.control.runUpdate()
    const failure = await pending.navigation
    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true)
    await updating
    expect(pending.control.value.skipTransition).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()
    await finishNavigation(await beginNavigation(router, '/workspaces'))
    expect(router.currentRoute.value.path).toBe('/workspaces')
  })

  it('后续守卫抛错时释放当前快照，保留错误并允许后续导航', async () => {
    const router = await routerAt('/login')
    const failure = new Error('虚构导航守卫失败')
    router.beforeResolve((to) => {
      if (to.path === '/register') throw failure
    })
    const pending = await beginNavigation(router, '/register')
    const result = pending.navigation.catch((cause: unknown) => cause)
    const updating = pending.control.runUpdate()
    expect(await result).toBe(failure)
    await updating
    expect(pending.control.value.skipTransition).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/login')
    await finishNavigation(await beginNavigation(router, '/workspaces'))
    expect(router.currentRoute.value.path).toBe('/workspaces')
  })

  it.each(['unsupported', 'reduced-motion', 'sync-error'])(
    '%s 时正常导航并清理标识',
    async (mode) => {
      const router = await routerAt('/login')
      if (mode === 'unsupported') setStartViewTransition(undefined)
      if (mode === 'reduced-motion') reducedMotion = true
      if (mode === 'sync-error')
        startViewTransition.mockImplementationOnce(() => {
          throw new Error('快照不可用')
        })
      await router.push('/workspaces')
      expect(router.currentRoute.value.path).toBe('/workspaces')
      expect(document.documentElement.dataset.routeTransition).toBeUndefined()
      expect(startViewTransition).toHaveBeenCalledTimes(mode === 'sync-error' ? 1 : 0)
    },
  )

  it('快照 ready 拒绝仍提交导航，动画 finished 拒绝清除许可', async () => {
    const router = await routerAt('/login')
    const pending = await beginNavigation(router, '/register')
    pending.control.ready.reject(new Error('旧快照已跳过'))
    const updating = pending.control.runUpdate()
    await pending.navigation
    await updating
    pending.control.finished.reject(new Error('动画已取消'))
    await Promise.resolve()
    expect(router.currentRoute.value.path).toBe('/register')
    expect(document.documentElement.dataset.routeTransition).toBeUndefined()
  })
})
