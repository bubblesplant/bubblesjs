export const REQUEST_ID_RESPONSE_HEADERS = {
  'X-Request-Id': {
    description: '服务端生成的请求关联 ID',
    schema: {
      type: 'string',
      format: 'uuid',
    },
  },
}
