import { lazyLoad } from '@/router/lazy-load'

export const authRoutes: RouteObject[] = [
  {
    path: '/login',
    element: lazyLoad('login'),
  },
  {
    path: '/register',
    element: lazyLoad('register'),
  },
]
