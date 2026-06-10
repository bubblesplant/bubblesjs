import path from 'path'

import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'

import devConfig from './dev'
import prodConfig from './prod'
import { CIPluginFn } from './release'

export default defineConfig<'webpack5'>(async (merge) => {
  // 设置 BROWSERSLIST_ENV 环境变量，以便在不同环境使用不同的 browserslist 配置
  process.env.BROWSERSLIST_ENV = process.env.NODE_ENV

  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'myApp',
    date: '2026-6-8',
    designWidth(input) {
      // 配置 NutUI 375 尺寸
      if ((input as any)?.file?.replace(/\\+/g, '/').indexOf('@nutui') > -1) {
        return 375
      }
      // 全局使用 Taro 默认的 750 尺寸
      return 750
    },
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
      375: 2 / 1,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      '@tarojs/plugin-generator',
      '@tarojs/plugin-html',
      ['@tarojs/plugin-mini-ci', CIPluginFn],
    ],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false,
    },
    sass: {
      data: '@use "@nutui/nutui-react-taro/dist/styles/variables.scss" as *;',
    },
    mini: {
      debugReact: true,
      compile: {
        include: [
          // 确保产物为 ES5，如可以确认包含 ES6 代码的 node_modules，则可修改正则采用白名单方式缩小编译范围，以提升编译速度
          (filename) =>
            /node_modules\/(?!(@babel|core-js|style-loader|css-loader|react|react-dom))/.test(
              filename,
            ),
        ],
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        const projectRoot = path.resolve(__dirname, '..')
        const srcRoot = path.resolve(projectRoot, 'src')
        const outputRoot = path.resolve(projectRoot, 'dist').replace(/\\/g, '/')
        const tailwindCssEntry = path.resolve(srcRoot, 'styles/index.css')

        chain.merge({
          watchOptions: {
            ignored: [`${outputRoot}/**`, '**/node_modules/**'],
          },
        })
        chain.plugin('weapp-tailwindcss').use(WeappTailwindcss, [
          {
            appType: 'taro',
            rem2rpx: true,
            tailwindcssBasedir: srcRoot,
            cssEntries: [tailwindCssEntry],
            tailwindcss: {
              version: 4,
              v4: {
                base: srcRoot,
                cssEntries: [tailwindCssEntry],
                sources: [
                  {
                    base: srcRoot,
                    pattern: '**/*.{html,js,ts,jsx,tsx}',
                    negated: false,
                  },
                ],
              },
            },
          },
        ])
      },
    },
    h5: {
      compile: {
        include: [
          // 确保产物为 ES5，如可以确认包含 ES6 代码的 node_modules，则可修改正则采用白名单方式缩小编译范围，以提升编译速度
          (filename) =>
            /node_modules\/(?!(@babel|core-js|style-loader|css-loader|react|react-dom))/.test(
              filename,
            ),
        ],
      },
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false,
        },
      },
    },
  }

  process.env.BROWSERSLIST_ENV = process.env.NODE_ENV

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }

  return merge({}, baseConfig, prodConfig)
})
