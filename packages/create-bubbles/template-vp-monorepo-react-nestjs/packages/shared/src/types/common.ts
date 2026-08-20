export interface ApiErrorDetail {
  readonly path?: string
  readonly code: string
  readonly message: string
}

export interface ApiFailure {
  readonly code: string
  readonly message: string
  readonly details?: ApiErrorDetail[]
}
