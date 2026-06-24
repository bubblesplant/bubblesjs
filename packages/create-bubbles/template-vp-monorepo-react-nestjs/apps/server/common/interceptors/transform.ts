import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { map } from 'rxjs'

import { BYPASS_KEY } from '../constants/decorator'
import { ResOp } from '../model/response'

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>) {
    const skip = this.reflector.getAllAndOverride<boolean>(BYPASS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (skip) {
      return next.handle()
    }

    return next.handle().pipe(
      map((data) => {
        return new ResOp(HttpStatus.OK, data ?? null)
      }),
    )
  }
}
