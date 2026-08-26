# Server 错误处理规则

本规则供 AI 修改 `apps/server` 时执行。

## 默认策略

如果客户端不需要特定错误码、文案或 HTTP 状态：

- 不要 `catch`。
- 不要手动包装成 `AppException`。
- 让异常直接向上冒泡。
- 由 `GlobalExceptionFilter` 统一记录日志并返回 `COMMON.INTERNAL_SERVER_ERROR` 和 HTTP 500。

```ts
// 正确：没有特殊输出要求，直接交给全局异常过滤器
const user = await this.userRepository.findById(userId)
```

本项目实际使用的是全局异常过滤器 `GlobalExceptionFilter`，业务代码不要重复实现统一错误响应。

## 什么时候使用 AppException

只有以下情况使用 `AppException`：

1. 客户端需要识别明确的业务错误，例如账号已存在、登录失效、资源不存在。
2. 外部依赖失败必须明确返回模块级 HTTP 503。
3. 需要返回安全的字段错误 `details`。

```ts
if (!user) {
  throw new AppException(USER_ERRORS.NOT_FOUND)
}
```

模块错误定义在对应的 `*.errors.ts`：

```ts
export const USER_ERRORS = {
  NOT_FOUND: {
    code: 'USER.NOT_FOUND',
    publicMessage: '用户不存在',
    status: HttpStatus.NOT_FOUND,
  },
} as const satisfies Record<string, AppErrorDefinition>
```

错误码必须全局唯一、采用大写 `模块.错误名称` 格式。公开文案不得包含堆栈、SQL、Redis 数据、连接信息、令牌或底层错误文本。HTTP 401 必须设置 `bearerChallenge: true`。

## 基础设施错误

默认让数据库、Redis 和第三方 SDK 的未知异常交给全局过滤器处理。

只有明确要求返回模块级 503 时，才在最接近依赖的边界转换一次：

```ts
try {
  return await operation()
} catch (cause: unknown) {
  if (cause instanceof AppException) {
    throw cause
  }

  throw new AppException(USER_ERRORS.SERVICE_UNAVAILABLE, { cause })
}
```

不要：

- 在每个数据库或 Redis 调用后添加 `.catch()`。
- 外层已经转换错误，内层再次包装。
- 捕获后只记录日志再抛出；全局过滤器已负责 5xx 日志。
- 把整个业务流程包装成 503，导致程序错误被伪装成服务不可用。

`catch` 仅用于错误语义转换、事务回滚、资源清理、重试或明确降级。

## 相关文件

- `src/common/exceptions/app.exception.ts`：`AppException`。
- `src/common/error/common.error.ts`：公共错误。
- `src/modules/*/*.errors.ts`：模块错误。
- `src/common/filters/global-exception.filter.ts`：统一异常处理。
- `test/error-catalog.spec.ts`：错误码校验。

新增错误目录后，将其加入 `error-catalog.spec.ts`，然后运行 `vp check`、`vp test` 和 `vp run build`。如果检查被无关的既有问题阻塞，只报告问题，不要擅自批量修改无关文件。
