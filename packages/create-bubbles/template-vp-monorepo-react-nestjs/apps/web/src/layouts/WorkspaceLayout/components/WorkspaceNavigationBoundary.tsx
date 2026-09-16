import { ConfigProvider, Modal } from 'antd'

interface WorkspaceNavigationBoundaryProps extends PropsWithChildren {
  navigating: boolean
  refreshing: boolean
  fallback: ReactNode
}

/**
 * 跨路由导航时卸载旧页面；同路由权限重校验时保留页面状态但隔离全部页面交互。
 * 页面级 Ant Design portal 统一挂到独立宿主；静态 Modal 不受上下文管理，等待时直接清理。
 */
export default function WorkspaceNavigationBoundary({
  navigating,
  refreshing,
  fallback,
  children,
}: WorkspaceNavigationBoundaryProps) {
  const portalHostRef = useRef<HTMLDivElement>(null)
  const blocked = navigating || refreshing

  /** 返回 ProLayout 外的页面专属 portal 宿主，首次提交前暂时回退到 body。 */
  const getPopupContainer = useCallback(() => portalHostRef.current ?? document.body, [])

  useLayoutEffect(() => {
    if (blocked) Modal.destroyAll()
  }, [blocked])

  return (
    <>
      <ConfigProvider getPopupContainer={getPopupContainer}>
        {navigating ? (
          fallback
        ) : (
          <>
            <div className="workspace-page-surface" hidden={refreshing} inert={refreshing}>
              {children}
            </div>
            {refreshing && fallback}
          </>
        )}
      </ConfigProvider>
      {createPortal(
        <div
          ref={portalHostRef}
          className="workspace-portal-host"
          hidden={blocked}
          inert={blocked}
          aria-hidden={blocked ? true : undefined}
        />,
        document.body,
      )}
    </>
  )
}
