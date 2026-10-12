import PageLoading from '@/components/Loading/PageLoading'
import RouteTransition from '@/components/RouteTransition/RouteTransition'
import RouteError from '@/pages/error/error'
import { authRoutes } from './auth'
import { companyRoutes } from './company'
import { entryRoutes } from './entry'
import { exampleRoutes } from './examples'
import { fallbackRoutes } from './fallback'
import { platformRoutes } from './platform'
import { projectRoutes } from './project'

export const routes: RouteObject[] = [
  {
    id: 'root',
    element: <RouteTransition region="layout" />,
    errorElement: (
      <RouteTransition region="layout">
        <RouteError />
      </RouteTransition>
    ),
    HydrateFallback: PageLoading,
    children: [
      ...authRoutes,
      ...entryRoutes,
      ...platformRoutes,
      ...companyRoutes,
      ...projectRoutes,
      ...exampleRoutes,
      ...fallbackRoutes,
    ],
  },
]
