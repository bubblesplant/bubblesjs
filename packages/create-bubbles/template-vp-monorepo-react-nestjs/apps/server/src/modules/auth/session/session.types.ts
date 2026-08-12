import { FastifyRequest } from 'fastify'
import { SessionTerminalType } from 'shared/types'

export interface CurrentAuth {
  userId: string
  terminal: SessionTerminalType
}

export type AuthenticatedRequest = FastifyRequest & {
  auth?: CurrentAuth
}

export interface CreateSessionInput {
  tokenDigest: string
  userId: string
  terminal: SessionTerminalType
  loginIp: string
  userAgent: string
}

export interface CreatedSession {
  initialExpiresAtMs: number
  absoluteExpiresAtMs: number
}
