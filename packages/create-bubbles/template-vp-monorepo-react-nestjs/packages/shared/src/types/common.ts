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

export interface SchemaValidationIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
  readonly code?: string
}
