import RouteTransition from '@/components/RouteTransition/RouteTransition'
import RouteError from '@/pages/error/error'
import { lazyLoad } from '@/router/lazy-load'
import { entryMiddleware, workspacesMiddleware } from '@/router/middleware'

export const entryRoutes: RouteObject[] = [
  { path: '/', middleware: [workspacesMiddleware, entryMiddleware] },
  { path: '/home', middleware: [workspacesMiddleware, entryMiddleware] },
  {
    id: 'workspaces',
    path: '/workspaces',
    element: lazyLoad('workspaces'),
    middleware: [workspacesMiddleware],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
  },
]
