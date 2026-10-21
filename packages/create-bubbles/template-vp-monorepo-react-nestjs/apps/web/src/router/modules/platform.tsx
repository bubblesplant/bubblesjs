import RouteTransition from '@/components/RouteTransition/RouteTransition'
import WorkspaceLayout from '@/layouts/WorkspaceLayout'
import RouteError from '@/pages/error/error'
import { authMiddleware, scopeMiddleware } from '@/router/middleware'
import { page } from './access/page'

export const platformRoutes: RouteObject[] = [
  {
    id: 'platform',
    path: '/platform',
    element: <WorkspaceLayout />,
    middleware: [authMiddleware, scopeMiddleware('platform')],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
    children: [
      page('platform.home', 'access', 'home'),
      page('platform.dictionaries', 'dictionaries'),
      page('platform.companies', 'access', 'entities'),
      page('platform.accounts', 'access', 'members'),
      page('platform.roles', 'access', 'roles'),
      page('platform.menus', 'access/menus'),
      page('platform.audit', 'access', 'audit'),
    ],
  },
]
