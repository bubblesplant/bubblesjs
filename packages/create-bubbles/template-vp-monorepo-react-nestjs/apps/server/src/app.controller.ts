import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AppService } from './app.service'
import { Public } from './common/decorators/public.decorator'

@ApiTags('服务状态')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * 为公开的根路径返回应用欢迎信息，便于快速确认 HTTP 服务可用。
   */
  @ApiOperation({ summary: '获取服务欢迎信息' })
  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello()
  }
}
