import Taro from '@tarojs/taro'
import SparkMD5 from 'spark-md5'

/**
 * H5 端：canvas 元素转 File
 */
export function canvasToFile(canvas, filename = 'image.png', mimeType = 'image/png', quality = 1): Promise<File> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const file = new File([blob], filename, { type: mimeType })
      resolve(file)
    }, mimeType, quality)
  })
}

/**
 * 获取本地文件信息（小程序端）
 */
export function getFileInfo(filePath: string): Promise<Taro.getFileInfo.SuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    Taro.getFileInfo({
      filePath,
      success: resolve,
      fail: reject,
    })
  })
}

export function file2Md5(file): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const spark = new SparkMD5.ArrayBuffer()
      spark.append(e.target?.result)
      resolve(spark.end())
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
