export interface ApiErrorDetail {
  path?: string
  code: string
  message: string
}

export interface ApiSuccess<T> {
  code: 200
  data: T
  message: string
  requestId: string
}

export interface ApiFailure {
  code: string
  data: null
  message: string
  requestId: string
  details?: ApiErrorDetail[]
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
