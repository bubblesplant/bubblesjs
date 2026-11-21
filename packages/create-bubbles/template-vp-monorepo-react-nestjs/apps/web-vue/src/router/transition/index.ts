import type { RouteLocationNormalized, Router } from 'vue-router'
import { accessScopeKey } from 'shared/utils'
import { nextTick } from 'vue'
import { routeScope } from '../access'
import './transition.css'

/** 在鉴权、懒加载完成后协调快照与路由提交，避免保留旧页面组件。 */
export function createRouteTransition(router: Router) {
  let active:
    | {
        to: RouteLocationNormalized
        navigate: () => void
        commit: () => void
        transition?: ViewTransition
      }
    | undefined

  /** 仅由所属导航清除快照许可，避免旧动画完成时影响新导航。 */
  function clear(pending: NonNullable<typeof active>) {
    if (active !== pending) return
    delete document.documentElement.dataset.routeTransition
    active = undefined
  }

  /** 释放前次导航的两个等待点，连续切页或取消时也不会阻塞守卫。 */
  function skipActive() {
    if (!active) return
    const pending = active
    pending.navigate()
    pending.commit()
    pending.transition?.skipTransition()
    clear(pending)
  }

  /** 相同空间或示例布局只切换正文，其余导航切换整个页面。 */
  function region(to: RouteLocationNormalized, from: RouteLocationNormalized) {
    const targetScope = routeScope(to)
    const sourceScope = routeScope(from)
    if (targetScope && sourceScope && accessScopeKey(targetScope) === accessScopeKey(sourceScope))
      return 'page'
    if (to.path.startsWith('/examples/') && from.path.startsWith('/examples/')) return 'page'
    return to.path === from.path ? undefined : 'layout'
  }

  router.beforeEach(skipActive)
  router.beforeResolve((to, from) => {
    const transitionRegion = region(to, from)
    if (
      !from.matched.length ||
      !transitionRegion ||
      typeof document.startViewTransition !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return

    let navigate!: () => void
    let commit!: () => void
    const navigationReady = new Promise<void>((resolve) => {
      navigate = resolve
    })
    const committed = new Promise<void>((resolve) => {
      commit = resolve
    })
    const pending: NonNullable<typeof active> = { to, navigate, commit }
    active = pending
    document.documentElement.dataset.routeTransition = transitionRegion

    try {
      pending.transition = document.startViewTransition(async () => {
        navigate()
        await committed
      })
      // 快照不可用或被快速导航跳过时，浏览器仍执行更新回调完成导航。
      void pending.transition.ready.catch(() => {})
      void pending.transition.finished.then(
        () => clear(pending),
        () => clear(pending),
      )
    } catch {
      skipActive()
    }
    return navigationReady
  })
  router.afterEach(async (to, _from, failure) => {
    const pending = active
    if (!pending || pending.to !== to) return
    if (failure) {
      skipActive()
      return
    }
    // 等待 RouterView 和标题提交；快照更新期间渲染暂停，不能在此等待动画帧。
    await nextTick()
    pending.commit()
  })
  router.onError((_error, to) => {
    if (active?.to === to) skipActive()
  })
  import.meta.hot?.dispose(skipActive)
}
