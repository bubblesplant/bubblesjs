// babel-preset-taro 更多选项和默认值：
// https://docs.taro.zone/docs/next/babel-config
module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: true,
        compiler: 'webpack5',
        useBuiltIns: process.env.TARO_ENV === 'h5' ? 'usage' : false,
      },
    ],
  ],
  plugins: [
    [
      'import',
      {
        libraryName: '@nutui/nutui-react-taro',
        camel2DashComponentName: false,
        customName: (name, file) => {
          return `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}`
        },
        // 自动加载 scss 样式文件
        customStyleName: (name) =>
          `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}/style`,
        // 自动加载 css 样式文件
        // customStyleName: (name) => `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}/style/css`

        // JMAPP 主题
        // 自动加载 scss 样式文件
        // customStyleName: (name) => `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}/style-jmapp`,
        // 自动加载 css 样式文件
        // customStyleName: (name) => `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}/style-jmapp/css`

        // jrkf 端主题
        // 自动加载 scss 样式文件
        // customStyleName: (name) => `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}/style-jrkf`,
        // 自动加载 css 样式文件
        // customStyleName: (name) => `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}/style-jrkf/css`
      },
      'nutui-react',
    ],
  ],
}
