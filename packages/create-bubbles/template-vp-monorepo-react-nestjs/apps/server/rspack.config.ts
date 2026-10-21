import { CopyRspackPlugin, type Configuration } from '@rspack/core'

/** 将摘要 Worker 复制到 bundle 同级目录，匹配打包后 __dirname 的实际位置，并随 watch 更新。 */
export default (options: Configuration): Configuration => ({
  ...options,
  plugins: [
    ...(options.plugins ?? []),
    new CopyRspackPlugin({
      patterns: [
        {
          from: 'src/modules/upload/hash/*.cjs',
          to: '[name][ext]',
        },
      ],
    }),
  ],
})
