export default defineAppConfig({
  pages: [
    'pages/index/index',
  ],
  subPackages: [
    {
      root: 'pages/example',
      pages: [
        'upload/index',
      ],
    },
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'WeChat',
    navigationBarTextStyle: 'black',
  },
})
