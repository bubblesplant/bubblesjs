import RouteTransition from '@/components/RouteTransition/RouteTransition'
import WorkspaceLayout from '@/layouts/WorkspaceLayout'
import RouteError from '@/pages/error/error'
import { authMiddleware, scopeMiddleware } from '@/router/middleware'
import { accessScopeRoutePath, createAccessRoutes } from '@/router/access-pages/routes'

export const companyRoutes: RouteObject[] = [
  {
    id: 'company',
    path: accessScopeRoutePath('company'),
    element: <WorkspaceLayout />,
    middleware: [authMiddleware, scopeMiddleware('company')],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
    children: createAccessRoutes('company'),
  },
]
