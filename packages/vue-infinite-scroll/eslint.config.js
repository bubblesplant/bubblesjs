import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: {
    css: true, // 启用 CSS、LESS、SCSS 及 Vue <style> 块格式化
    html: true, // 启用 HTML 文件格式化
  },
  vue: true,
  unocss: true,
},
// import rules
{
  rules: {
    'perfectionist/sort-imports': [ // 配置导入排序
      'error',
      {
        customGroups: {
          type: {
            'vue-type': ['^vue$', '^vue-.+', '^@vue/.+'],
          },
          value: {
            vue: ['^vue$', '^vue-.+', '^@vue/.+'], // Vue 相关库
            components: ['^@/components/.+', '@/tmui/.+'], // 组件
            stores: ['^@/store/.+'], // 状态管理
            utils: ['^@/utils/.+'], // 工具函数
            constants: ['^@/constants/.+'], // 常量
            hooks: ['^@/hooks/.+'], // 自定义 hooks
            api: ['^@/service/.+'], // API 服务
          },
        },
        environment: 'node',
        groups: [
          // 类型导入
          ['external-type', 'builtin-type', 'type'],
          'vue-type',
          ['parent-type', 'sibling-type', 'index-type'],
          ['internal-type'],
          // 值导入
          'builtin',
          'vue',
          'external',
          'internal',
          // 内部模块
          'components',
          'stores',
          'utils',
          'constants',
          'hooks',
          'api',
          // 其他
          ['parent', 'sibling', 'index'],
          'side-effect',
          'side-effect-style',
          'style',
          'object',
          'unknown',
        ],
        internalPattern: ['^@/.+'], // 内部模块路径匹配
        newlinesBetween: 'always', // 导入组之间空行
        order: 'asc', // 升序排序
        type: 'natural', // 自然排序
      },
    ],
  },
}, {
  rules: {
    'n/prefer-global/process': 'off',
  },
})
