/** 不需要权限校验的路由 */
export const IS_PUBLIC_KEY = Symbol('is_public')
/** 该接口要直接查询redis服务器而不是走jwt 解析的key */
export const AUTH_CONSISTENCY_KEY = Symbol('auth_consistency')

/**
 *  bounded 普通模式 每次请求各自服务独立校验有30s 存活时间（过期了）
 *  strong 强模式 每次请求都校验redis 服务器是否有该用户（主要为了方式jwt 无法强制踢人 一些高危接口强制走redis 校验）
 */
export type AuthConsistency = 'bounded' | 'strong'
