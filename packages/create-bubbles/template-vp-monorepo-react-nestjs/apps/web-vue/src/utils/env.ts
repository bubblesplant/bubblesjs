/**
 * 通过一个文件导出所有的环境变量这样方便统一修改
 * @returns
 */
export const envVariables = {
  PORT: import.meta.env.VITE_PORT,
  PATH: import.meta.env.VITE_PATH,
  APP_NAME: import.meta.env.VITE_APP_NAME,
  /** 后端接口前缀 */
  API_AFFIX: import.meta.env.VITE_API_AFFIX,
}
