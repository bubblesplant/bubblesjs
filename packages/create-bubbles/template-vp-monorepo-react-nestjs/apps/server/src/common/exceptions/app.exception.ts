import { HttpException, HttpStatus } from '@nestjs/common'
import { ApiErrorDetail } from 'shared/types'

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)+$/

export interface AppErrorDefinition<Code extends string = string> {
  readonly code: Code
  readonly publicMessage: string
  readonly status: HttpStatus
  readonly bearerChallenge?: true
}

export interface AppExceptionOptions {
  readonly cause?: unknown
  readonly details?: readonly ApiErrorDetail[]
}

function assertErrorDefinition(definition: AppErrorDefinition): void {
  if (!ERROR_CODE_PATTERN.test(definition.code) || definition.code.length > 80) {
    throw new TypeError('Invalid application error code: ' + definition.code)
  }

  if (definition.status < 400 || definition.status > 599) {
    throw new TypeError('Application error status must be between 400 and 599')
  }

  if (!definition.publicMessage.trim()) {
    throw new TypeError('Application error publicMessage must not be empty')
  }

  if (definition.bearerChallenge && definition.status !== 401) {
    throw new TypeError('bearerChallenge is only valid for HTTP 401')
  }

  if (definition.status === 401 && !definition.bearerChallenge) {
    throw new TypeError('HTTP 401 errors must declare bearerChallenge')
  }
}

export class AppException extends HttpException {
  readonly definition: AppErrorDefinition
  readonly details?: readonly ApiErrorDetail[]

  constructor(definition: AppErrorDefinition, options: AppExceptionOptions = {}) {
    assertErrorDefinition(definition)

    super(definition.publicMessage, definition.status, {
      cause: options.cause,
    })

    this.name = AppException.name
    this.definition = definition
    this.details = options.details
  }
}
