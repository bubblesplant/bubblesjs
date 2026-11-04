import './RouteTransition.css'

/** 按导航标识滑动布局或内容区，提交后关闭转场许可，隔离弹窗和页内异步更新。 */
export default function RouteTransition({
  children,
  region = 'page',
}: PropsWithChildren<{ region?: 'layout' | 'page' }>) {
  const location = useLocation()
  const matches = useMatches()
  const transitionName = region === 'layout' ? 'route-layout' : 'route-page'
  // 无路径父层与根匹配共享 pathname，布局标识取第一个具体路径。
  const layoutPathname = matches.find((match) => match.pathname !== matches[0]?.pathname)?.pathname
  const transitionKey = region === 'layout' ? (layoutPathname ?? location.pathname) : location.key
  const previousTransitionKey = useRef(transitionKey)
  const [committedTransitionKey, setCommittedTransitionKey] = useState(transitionKey)
  const update = committedTransitionKey === transitionKey ? 'none' : transitionName

  // onUpdate 先于 passive effect 执行；无动画的同步导航也需要更新基准。
  useEffect(() => {
    previousTransitionKey.current = transitionKey
    // Ref 不会刷新已提交的 ViewTransition 属性；显式关闭后续布局更新的动画许可。
    setCommittedTransitionKey(transitionKey)
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
