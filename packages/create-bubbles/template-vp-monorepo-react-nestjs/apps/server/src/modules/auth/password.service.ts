import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

@Injectable()
export class PasswordService {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
    })
  }

  async verify(passswordHash: string, password: string) {
    try {
      return await argon2.verify(passswordHash, password)
    } catch {
      return false
    }
  }
}
