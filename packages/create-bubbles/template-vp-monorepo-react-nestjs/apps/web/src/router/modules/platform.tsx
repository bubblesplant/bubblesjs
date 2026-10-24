import RouteTransition from '@/components/RouteTransition/RouteTransition'
import WorkspaceLayout from '@/layouts/WorkspaceLayout'
import RouteError from '@/pages/error/error'
import { authMiddleware, scopeMiddleware } from '@/router/middleware'
import { accessScopeRoutePath, createAccessRoutes } from '@/router/access-pages/routes'

export const platformRoutes: RouteObject[] = [
  {
    id: 'platform',
    path: accessScopeRoutePath('platform'),
    element: <WorkspaceLayout />,
    middleware: [authMiddleware, scopeMiddleware('platform')],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
    children: createAccessRoutes('platform'),
  },
]
