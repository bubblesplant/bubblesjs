export type AppErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503

interface AppErrorOptions {
  status: AppErrorStatus
  message: string
  code?: number
  details?: unknown
  cause?: unknown
}

export class AppError extends Error {
  readonly status: AppErrorStatus
  readonly code: number
  readonly details?: unknown

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = 'AppError'
    this.status = options.status
    this.code = options.code ?? options.status
    this.details = options.details
  }
}
