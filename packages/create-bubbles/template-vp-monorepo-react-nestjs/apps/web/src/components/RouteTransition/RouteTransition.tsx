import './RouteTransition.css'

/** 跨布局或工作空间滑动整页，同一布局内仅滑动内容区；忽略同一路由的异步更新。 */
export default function RouteTransition({
  children,
  region = 'page',
}: PropsWithChildren<{ region?: 'layout' | 'page' }>) {
  const location = useLocation()
  const matches = useMatches()
  const transitionName = region === 'layout' ? 'route-layout' : 'route-page'
  const transitionKey =
    region === 'layout' ? (matches[1]?.pathname ?? location.pathname) : location.key
  const previousTransitionKey = useRef(transitionKey)
  const update =
    region === 'layout' && previousTransitionKey.current === transitionKey ? 'none' : transitionName

  // onUpdate 先于 passive effect 执行；无动画的同步导航也需要更新基准。
  useEffect(() => {
    previousTransitionKey.current = transitionKey
  }, [transitionKey])

  /** 同一导航只保留首次滑动，取消当前区域因页内更新产生的快照动画。 */
  function handleUpdate() {
    if (previousTransitionKey.current !== transitionKey) {
      previousTransitionKey.current = transitionKey
      return
    }

    for (const animation of document.documentElement.getAnimations({ subtree: true })) {
      const effect = animation.effect
      if (
        effect instanceof KeyframeEffect &&
        new RegExp(`^::view-transition-(group|image-pair|old|new)\\(${transitionName}\\)$`).test(
          effect.pseudoElement ?? '',
        )
      ) {
        animation.cancel()
      }
    }
  }

  return (
    <ReactViewTransition
      name={transitionName}
      default="none"
      update={update}
      onUpdate={handleUpdate}
    >
      <div className={`route-transition-${region}`}>{children ?? <Outlet />}</div>
    </ReactViewTransition>
  )
}
