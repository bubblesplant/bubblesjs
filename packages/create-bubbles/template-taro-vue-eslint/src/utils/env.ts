import process from 'node:process'

export const envVar = {
  apiApi: process.env.TARO_API_URL,
  weappId: process.env.TARO_WEAPP_ID,
}
