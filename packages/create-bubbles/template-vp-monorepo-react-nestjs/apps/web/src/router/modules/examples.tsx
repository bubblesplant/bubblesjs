import RouteTransition from '@/components/RouteTransition/RouteTransition'
import BasicLayout from '@/layouts/BasicLayout'
import RouteError from '@/pages/error/error'
import { lazyLoad } from '@/router/lazy-load'

export const exampleRoutes: RouteObject[] = [
  {
    path: '/examples',
    element: <BasicLayout />,
    errorElement: (
      <RouteTransition>
        <RouteError />
      </RouteTransition>
    ),
    children: [
      { path: 'pro-table', element: lazyLoad('examples/pro-table') },
      { path: 'pro-table/draft', element: lazyLoad('examples/pro-table/draft') },
      { path: 'i18n', element: lazyLoad('examples/i18n') },
    ],
  },
]
