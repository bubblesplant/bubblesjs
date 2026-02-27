const apiUrl = process.env.TARO_APP_API_URL
const apiAffix = process.env.TARO_APP_API_AFFIX
const uploadApiAffix = process.env.TARO_APP_UPLOAD_API_AFFIX
const weappId = process.env.TARO_APP_ID
const isH5 = process.env.TARO_ENV === 'h5'

export {
  apiAffix,
  apiUrl,
  isH5,
  uploadApiAffix,
  weappId,
}
