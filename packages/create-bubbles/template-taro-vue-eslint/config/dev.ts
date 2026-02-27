import type { UserConfigExport } from '@tarojs/cli'

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  h5: {
    devServer: {
      open: false,
      port: 9970,
      proxy: {
        [`/${process.env.TARO_APP_API_AFFIX}`]: {
          target: process.env.TARO_APP_API_URL,
          changeOrigin: true,
          secure: false,
        },
        [`/${process.env.TARO_APP_UPLOAD_API_AFFIX}`]: {
          target: process.env.TARO_APP_API_URL,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  },
} satisfies UserConfigExport<'webpack5'>
