/**
 * @description 跳过响应成功的包装
 */

import { SetMetadata } from '@nestjs/common'

import { BYPASS_KEY } from '../constants/decorator'

/**
 * 当不需要转换成基础返回格式时添加该装饰器
 */
export const Bypass = () => SetMetadata(BYPASS_KEY, true)
