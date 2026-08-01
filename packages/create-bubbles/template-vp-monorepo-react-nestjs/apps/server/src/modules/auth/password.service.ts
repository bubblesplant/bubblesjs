import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

const HASH_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}

@Injectable()
export class PasswordService {
  private readonly dummyHash = argon2.hash(
    'not-a-real-user-password-for-timing-equalization',
    HASH_OPTIONS,
  )

  hash(password: string) {
    return argon2.hash(password, HASH_OPTIONS)
  }

  async verify(passwordHash: string | null, password: string) {
    const targetHash = passwordHash ?? (await this.dummyHash)

    try {
      return await argon2.verify(targetHash, password)
    } catch {
      await argon2.verify(await this.dummyHash, password).catch(() => false)
      return false
    }
  }
}
