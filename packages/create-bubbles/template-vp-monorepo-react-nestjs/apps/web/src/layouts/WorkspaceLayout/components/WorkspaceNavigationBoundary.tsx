import { ConfigProvider, Modal } from 'antd'

interface WorkspaceNavigationBoundaryProps extends PropsWithChildren {
  navigating: boolean
  refreshing: boolean
  fallback: ReactNode
}

/**
 * 导航或权限重校验期间保留页面结构，隔离全部页面交互并显示等待态；目标路由提交后由
 * Outlet 替换旧页面，以便页面过渡捕获连续的新旧快照。页面级 Ant Design portal 统一挂到
 * 独立宿主；静态 Modal 不受上下文管理，等待时直接清理。
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
        <div className="workspace-page-surface" hidden={refreshing} inert={blocked}>
          {children}
        </div>
        {blocked && fallback}
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
