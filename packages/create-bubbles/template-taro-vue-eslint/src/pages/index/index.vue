<script lang="ts" setup>
import Taro from '@tarojs/taro'
import { uploadFile } from '@/api/common/upload'
import { canvasToFile, file2Md5 } from '@/utils'
import { isH5 } from '@/utils/env'

async function handleConfirm(canvas: any, data: string) {
  if (isH5) {
    const file = await canvasToFile(canvas)
    const fileMd5 = await file2Md5(file)
    const data = new FormData()
    data.append('file', file)
    data.append('companyId', 'c35bd5e0d5834eccb1cfbf4dd538eb61')
    data.append('projectId', 'eb42a2b7e680a4124e78951ccf7f1268')
    data.append('indexDbId', '0')
    data.append('fileMd5', fileMd5)
    data.append('fileSize', `${file.size}`)
    data.append('filename', file.name)
    try {
      const res = await uploadFile(data)
      if (res.code === 200) {
        // console.log('💦res.data', res.data)
      }
      else {
        Taro.showToast({
          title: res.message,
        })
      }
    }
    catch {
      Taro.showToast({
        title: '服务异常',
      })
    }
  }
  else {
    // 小程序端：用 Taro uploadFile 适配器
    Taro.getFileSystemManager().getFileInfo({
      filePath: data,
      success: async (res) => {
        const params = {
          filePath: data,
          companyId: 'c35bd5e0d5834eccb1cfbf4dd538eb61',
          projectId: 'eb42a2b7e680a4124e78951ccf7f1268',
          indexDbId: '0',
          fileMd5: res.digest,
          fileSize: res.size,
          filename: `${res.digest}.png`,
        }
        const uploadResStr = await uploadFile(params)
        const uploadRes = JSON.parse(uploadResStr)
        if (uploadRes.code === 200) {
          // console.log('💦uploadRes.data', uploadRes.data)
        }
        else {
          Taro.showToast({
            title: uploadRes.message,
          })
        }
      },
    })
  }
}
</script>

<template>
  <div class="text-red">
    <text class="text-green">
      1112
    </text>

    <text class="text-purple">
      1112
    </text>
    <nut-signature @confirm="handleConfirm" />
  </div>
</template>
