import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

export const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const

@Injectable()
export class PasswordService {
  hash(password: string) {
    return argon2.hash(password, PASSWORD_HASH_OPTIONS)
  }

  async verify(passswordHash: string, password: string) {
    try {
      return await argon2.verify(passswordHash, password)
    } catch {
      return false
    }
  }
}
