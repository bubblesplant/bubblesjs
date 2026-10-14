/** 既有数据库演示接口的入参；业务注册使用 RegisterRequest。 */
export interface DbCreateUserRequest {
  name: string
  account: string
  passwordHash: string
}
