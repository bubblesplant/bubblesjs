import RouteTransition from '@/components/RouteTransition/RouteTransition'
import { lazyLoad } from '@/router/lazy-load'

export const authRoutes: RouteObject[] = [
  {
    path: '/login',
    element: <RouteTransition>{lazyLoad('login')}</RouteTransition>,
  },
  {
    path: '/register',
    element: <RouteTransition>{lazyLoad('register')}</RouteTransition>,
  },
  {
    path: '/member-invitations/accept',
    element: <RouteTransition>{lazyLoad('member-invitations', 'accept')}</RouteTransition>,
  },
]
