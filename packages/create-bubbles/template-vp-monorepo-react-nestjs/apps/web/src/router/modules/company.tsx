import RouteTransition from '@/components/RouteTransition/RouteTransition'
import WorkspaceLayout from '@/layouts/WorkspaceLayout'
import RouteError from '@/pages/error/error'
import { authMiddleware, scopeMiddleware } from '@/router/middleware'
import { page } from './access/page'

export const companyRoutes: RouteObject[] = [
  {
    id: 'company',
    path: '/companies/:companyId',
    element: <WorkspaceLayout />,
    middleware: [authMiddleware, scopeMiddleware('company')],
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
    children: [
      page('company.home', 'access', 'home'),
      page('company.profile', 'access', 'profile'),
      page('company.members', 'access', 'members'),
      page('company.roles', 'access', 'roles'),
      page('company.organization', 'organization'),
      page('company.positions', 'positions'),
      page('company.organization.templates', 'organization-templates'),
      page('company.projects', 'access', 'entities'),
      page('company.audit', 'access', 'audit'),
    ],
  },
]
