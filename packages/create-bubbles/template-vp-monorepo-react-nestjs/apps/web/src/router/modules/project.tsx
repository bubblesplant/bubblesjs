import RouteTransition from '@/components/RouteTransition/RouteTransition'
import WorkspaceLayout from '@/layouts/WorkspaceLayout'
import RouteError from '@/pages/error/error'
import { scopeMiddleware } from '@/router/middleware'
import { accessScopeRoutePath, createAccessRoutes } from '@/router/access-pages/routes'

export const projectRoutes: RouteObject[] = [
  {
    id: 'project',
    path: accessScopeRoutePath('project'),
    element: <WorkspaceLayout />,
    middleware: [scopeMiddleware('project')],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
    children: createAccessRoutes('project'),
  },
]
