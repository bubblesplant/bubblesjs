import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ApiErrorDetailDto {
  @ApiPropertyOptional({ example: 'account' })
  path?: string

  @ApiProperty({ example: 'too_small' })
  code!: string

  @ApiProperty({ example: '账号至少需要 4 个字符' })
  message!: string
}

export class ApiFailureDto {
  @ApiProperty({ example: 'COMMON.VALIDATION_FAILED' })
  code!: string

  @ApiProperty({ example: '请求参数校验失败' })
  message!: string

  @ApiPropertyOptional({
    type: () => [ApiErrorDetailDto],
  })
  details?: ApiErrorDetailDto[]
}
