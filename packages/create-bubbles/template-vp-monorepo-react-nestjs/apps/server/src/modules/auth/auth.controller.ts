import { SWAGGER_SESSION_AUTH } from '@/common/constants/swagger.constants'
import { Authenticated } from '@/common/decorators/access-policy.decorator'
import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import { Public } from '@/common/decorators/public.decorator'
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  SerializeOptions,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import type {
  ChangePasswordRequest,
  ChangePasswordResult,
  CurrentUser,
  LoginRequest,
  LoginResult,
  LogoutResult,
  RegisterRequest,
  RegisterResult,
} from 'shared/types'
import { AuthService } from './auth.service'
import {
  changePasswordResultSchema,
  currentUserSchema,
  loginResultSchema,
  logoutResultSchema,
  registerResultSchema,
} from './dto/auth-response.dto'
import { loginSchema } from './dto/login.dto'
import { registerSchema } from './dto/register.dto'
import { changePasswordSchema } from './password/change-password.dto'
import type { CurrentAuthType } from './session/session.types'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 接收注册资料，返回新账号的公开信息。 */
  @Public()
  @ApiOperation({ summary: '注册' })
  @ApiCreatedResponse({ standardSchema: registerResultSchema })
  @SerializeOptions({ schema: registerResultSchema })
  @Post('register')
  register(@Body({ schema: registerSchema }) body: RegisterRequest): Promise<RegisterResult> {
    return this.authService.register(body)
  }

  /** 从请求提取登录来源，创建或替换当前终端会话。 */
  @Public()
  @ApiOperation({ summary: '登录并创建登录会话' })
  @ApiOkResponse({ standardSchema: loginResultSchema })
  @SerializeOptions({ schema: loginResultSchema })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body({ schema: loginSchema }) body: LoginRequest,
    @Req() request: FastifyRequest,
  ): Promise<LoginResult> {
    return this.authService.login(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    })
  }

  /** 撤销请求头令牌对应的当前终端会话；保持退出接口幂等。 */
  @ApiBearerAuth(SWAGGER_SESSION_AUTH)
  @ApiOperation({ summary: '退出当前终端登录' })
  @ApiOkResponse({ standardSchema: logoutResultSchema })
  @SerializeOptions({ schema: logoutResultSchema })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Headers('authorization') authorization: string | undefined): Promise<LogoutResult> {
    return this.authService.logout(authorization)
  }

  /** 结合认证上下文与最新公开资料，返回当前用户及登录终端。 */
  @ApiBearerAuth(SWAGGER_SESSION_AUTH)
  @ApiOperation({ summary: '获取当前登录用户资料' })
  @ApiOkResponse({ standardSchema: currentUserSchema })
  @SerializeOptions({ schema: currentUserSchema })
  @Get('me')
  @Authenticated()
  async me(@CurrentAuth() auth: CurrentAuthType): Promise<CurrentUser> {
    const user = await this.authService.getCurrentUser(auth.userId)
    return { ...user, terminal: auth.terminal }
  }

  /** 修改本人密码，成功后撤销该用户全部终端会话。 */
  @ApiBearerAuth(SWAGGER_SESSION_AUTH)
  @ApiOperation({ summary: '修改本人密码并撤销全部终端会话' })
  @ApiOkResponse({ standardSchema: changePasswordResultSchema })
  @SerializeOptions({ schema: changePasswordResultSchema })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  changePassword(
    @CurrentAuth() auth: CurrentAuthType,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordRequest,
  ): Promise<ChangePasswordResult> {
    return this.authService.changePassword(auth.userId, body)
  }
}
