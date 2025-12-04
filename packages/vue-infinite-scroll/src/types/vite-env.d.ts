/// <reference types="vite/client" />

/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{}, {}, any>
  export default component
}

// vite-plugin-svg-icons 类型声明
declare module 'virtual:svg-icons-register' {
  const register: () => void
  export default register
}
