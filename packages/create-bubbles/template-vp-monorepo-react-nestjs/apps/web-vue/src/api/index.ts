import request from '@/utils/request'

export const EXPIRE_TIME = 60 * 10 * 1000

export function getTree() {
  return request.Get('/xxx/xx', {
    cacheFor: {
      mode: 'restore',
      expire: EXPIRE_TIME,
    },
  })
}
