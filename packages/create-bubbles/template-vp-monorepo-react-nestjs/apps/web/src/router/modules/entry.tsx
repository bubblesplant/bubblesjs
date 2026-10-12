import RouteTransition from '@/components/RouteTransition/RouteTransition'
import RouteError from '@/pages/error/error'
import { lazyLoad } from '@/router/lazy-load'
import { authMiddleware, entryMiddleware, workspacesMiddleware } from '@/router/middleware'

export const entryRoutes: RouteObject[] = [
  { path: '/', middleware: [authMiddleware, workspacesMiddleware, entryMiddleware] },
  { path: '/home', middleware: [authMiddleware, workspacesMiddleware, entryMiddleware] },
  {
    id: 'workspaces',
    path: '/workspaces',
    element: lazyLoad('workspaces'),
    middleware: [authMiddleware, workspacesMiddleware],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
  },
]
