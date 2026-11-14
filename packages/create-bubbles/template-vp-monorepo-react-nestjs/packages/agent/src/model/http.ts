import { z } from 'zod'
import { AgentError, checkSignal } from '../core/control.ts'

export interface HttpModelOptions {
  baseUrl: string
  model: string
  apiKey: string
  fetch?: typeof globalThis.fetch
  headers?: Record<string, string>
}

export class ModelHttpError extends AgentError {
  constructor(public readonly statusCode: number) {
    super('MODEL_HTTP_ERROR', `Model request failed (HTTP ${statusCode})`)
  }
}

/** 认证和协议错误不自动切换，避免掩盖配置问题。 */
export function canFallback(error: unknown): boolean {
  return error instanceof ModelHttpError
    ? error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500
    : error instanceof AgentError && error.code === 'MODEL_NETWORK_ERROR'
}

/** 保留网关路径前缀，同时接受已包含版本号或完整操作的地址。 */
export function endpoint(baseUrl: string, operation: string): string {
  const url = new URL(baseUrl)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new AgentError('INVALID_CONFIG', 'Invalid model base URL')
  }
  let path = url.pathname.replace(/\/+$/, '')
  if (!path.endsWith(`/${operation}`)) {
    path += path.endsWith('/v1') ? `/${operation}` : `/v1/${operation}`
  }
  url.pathname = path
  return url.href
}

/** 不读取失败响应正文，防止网关反射认证数据到错误输出。 */
export async function postJson(options: {
  url: string
  headers: Record<string, string>
  body: unknown
  signal: AbortSignal
  fetch: typeof globalThis.fetch
}): Promise<unknown> {
  checkSignal(options.signal)
  let response: Response
  try {
    response = await options.fetch(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch {
    checkSignal(options.signal)
    throw new AgentError('MODEL_NETWORK_ERROR', 'Model network request failed')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new ModelHttpError(response.status)
  }
  try {
    return await response.json()
  } catch {
    checkSignal(options.signal)
    throw new AgentError('INVALID_MODEL_RESPONSE', 'Model returned invalid JSON')
  }
}

/** Zod 协议解析失败只返回稳定错误码，不携带远端正文。 */
export function parseResponse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new AgentError('INVALID_MODEL_RESPONSE', 'Model returned an invalid response')
  }
  return parsed.data
}

export const tokenCount = z.number().int().nonnegative().safe()
