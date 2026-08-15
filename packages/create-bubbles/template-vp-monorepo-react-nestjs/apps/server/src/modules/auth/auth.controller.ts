import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import { Public } from '@/common/decorators/public.decorator'
import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { CurrentUser } from 'shared/types'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import type { CurrentAuthType } from './session/session.types'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: '注册' })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body)
  }

  @Public()
  @ApiOperation({ summary: '登录并创建 Redis Session' })
  @Post('login')
  login(@Body() body: LoginDto, @Req() request: FastifyRequest) {
    return this.authService.login(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    })
  }

  @ApiBearerAuth('session')
  @ApiOperation({ summary: '退出当前端' })
  @Public()
  @Post('logout')
  logout(@Headers('authorization') authorization: string | undefined) {
    return this.authService.logout(authorization)
  }

  @ApiBearerAuth('session')
  @ApiOperation({ summary: '使用 Session Token 获取当前用户资料' })
  @Get('me')
  async me(@CurrentAuth() auth: CurrentAuthType): Promise<CurrentUser> {
    const user = await this.authService.getCurrentUser(auth.userId)

    return {
      ...user,
      terminal: auth.terminal,
    }
  }
}
