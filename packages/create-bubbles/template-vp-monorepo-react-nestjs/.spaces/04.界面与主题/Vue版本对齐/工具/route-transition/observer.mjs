/** 在应用启动前观察原生快照、动画生命期及未处理异常，保持原 API 返回值与行为。 */
export function installTransitionObserver({ supported }) {
  window.__vueTransitionProbe = {
    events: [],
    unhandled: [],
    nativeSupported: typeof document.startViewTransition === 'function',
  }
  window.addEventListener('unhandledrejection', (event) => {
    window.__vueTransitionProbe.unhandled.push(String(event.reason?.stack || event.reason))
  })
  if (!supported) {
    document.startViewTransition = undefined
    return
  }
  const nativeStart = document.startViewTransition?.bind(document)
  if (!nativeStart) return

  /** 取得当前快照动画，避免将装饰、弹窗等普通 CSS 动画计入路由证据。 */
  function snapshots() {
    return document.documentElement
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.pseudoElement?.includes('view-transition'))
  }

  /** 记录边界与固定导航的实际位置，用于核对快照覆盖和内容导航的稳定性。 */
  function geometry() {
    return Object.fromEntries(
      [
        '.route-transition-layout',
        '.workspace-body',
        '.workspace-header',
        '.workspace-sidebar',
      ].map((selector) => {
        const element = document.querySelector(selector)
        if (!element) return [selector, null]
        const { x, y, width, height } = element.getBoundingClientRect()
        return [selector, { x, y, width, height }]
      }),
    )
  }

  /** 序列化动画参数、运行进度和组边界，保留百分比横滑关键帧。 */
  function animationState(animation) {
    const pseudo = animation.effect?.pseudoElement
    const style = pseudo?.startsWith('::view-transition-group(')
      ? getComputedStyle(document.documentElement, pseudo)
      : undefined
    return {
      name: animation.animationName,
      pseudo,
      playState: animation.playState,
      currentTime: animation.currentTime,
      duration: animation.effect?.getTiming().duration,
      easing: animation.effect?.getTiming().easing,
      geometry: style
        ? { width: style.width, height: style.height, transform: style.transform }
        : undefined,
      keyframes: animation.effect
        ?.getKeyframes()
        .map(({ transform, opacity, width, height, easing }) => ({
          transform,
          opacity,
          width,
          height,
          easing,
        })),
    }
  }

  /** 绑定每次原生过渡的动画实例，快速导航时不会把下一次动画误记到前一次。 */
  document.startViewTransition = function observeStart(...args) {
    const started = performance.now()
    const entry = {
      pathAtStart: location.pathname,
      region: document.documentElement.dataset.routeTransition,
      viewport: { width: innerWidth, height: innerHeight },
      beforeGeometry: geometry(),
      samples: [],
      animationResults: [],
      skipped: 0,
    }
    window.__vueTransitionProbe.events.push(entry)
    const transition = nativeStart(...args)
    const nativeSkip = transition.skipTransition.bind(transition)
    transition.skipTransition = function observeSkip() {
      entry.skipped += 1
      return nativeSkip()
    }
    let animations = []

    /** 对该过渡自己的动画采样，避免取消与连续导航导致证据串台。 */
    function sample(stage) {
      entry.samples.push({
        stage,
        elapsed: performance.now() - started,
        animations: animations.map(animationState),
      })
    }

    transition.updateCallbackDone.then(
      () => {
        entry.updatedAt = performance.now() - started
        entry.pathAfterUpdate = location.pathname
        entry.afterGeometry = geometry()
      },
      (error) => {
        entry.updateError = `${error.name}: ${error.message}`
      },
    )
    transition.ready.then(
      () => {
        entry.readyAt = performance.now() - started
        animations = snapshots()
        sample('ready')
        for (const animation of animations) {
          animation.finished.then(
            () => {
              entry.animationResults.push({
                pseudo: animation.effect?.pseudoElement,
                result: 'finished',
                elapsed: performance.now() - started,
              })
            },
            (error) => {
              entry.animationResults.push({
                pseudo: animation.effect?.pseudoElement,
                result: error.name,
                elapsed: performance.now() - started,
              })
            },
          )
        }
        requestAnimationFrame(() => {
          sample('frame-1')
          requestAnimationFrame(() => sample('frame-2'))
        })
        setTimeout(() => sample('100ms'), 100)
      },
      (error) => {
        entry.readyError = `${error.name}: ${error.message}`
      },
    )
    transition.finished.then(
      () => {
        entry.finishedAt = performance.now() - started
        entry.pathAtFinish = location.pathname
      },
      (error) => {
        entry.finishedError = `${error.name}: ${error.message}`
      },
    )
    return transition
  }
}
