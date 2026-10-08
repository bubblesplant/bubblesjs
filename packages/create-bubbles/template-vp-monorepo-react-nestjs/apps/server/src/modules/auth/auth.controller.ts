import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import { Authenticated } from '@/common/decorators/access-policy.decorator'
import { Public } from '@/common/decorators/public.decorator'
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { CurrentUser } from 'shared/types'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { ChangePasswordDto } from './password/change-password.dto'
import { RegisterDto } from './dto/register.dto'
import type { CurrentAuthType } from './session/session.types'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 接收注册资料，返回新账号的公开信息。
   */
  @Public()
  @ApiOperation({ summary: '注册' })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body)
  }

  /**
   * 从 HTTP 请求提取登录来源，并创建或替换当前终端会话。
   */
  @Public()
  @ApiOperation({ summary: '登录并创建 Redis Session' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() body: LoginDto, @Req() request: FastifyRequest) {
    return this.authService.login(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    })
  }

  /**
   * 按 Authorization 请求头撤销当前终端的会话。
   */
  @ApiBearerAuth('session')
  @ApiOperation({ summary: '退出当前端' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Headers('authorization') authorization: string | undefined) {
    return this.authService.logout(authorization)
  }

  /**
   * 结合认证上下文与最新用户资料，返回当前用户及登录终端。
   */
  @ApiBearerAuth('session')
  @ApiOperation({ summary: '使用 Session Token 获取当前用户资料' })
  @Get('me')
  @Authenticated()
  async me(@CurrentAuth() auth: CurrentAuthType): Promise<CurrentUser> {
    const user = await this.authService.getCurrentUser(auth.userId)

    return {
      ...user,
      terminal: auth.terminal,
    }
  }

  /** 根据当前会话身份修改本人密码，成功后该用户全部终端会话失效。 */
  @ApiBearerAuth('session')
  @ApiOperation({ summary: '修改本人密码并撤销全部终端会话' })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  changePassword(@CurrentAuth() auth: CurrentAuthType, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(auth.userId, body)
  }
}
