import { SetMetadata } from '@nestjs/common'
import { IS_PUBLIC_KEY } from '../constants/auth.constants'

/**
 * 标记路由或控制器为公开入口，供认证守卫放行。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
