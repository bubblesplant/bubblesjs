/**
 * 环境变量工具
 * 所有环境变量通过 import.meta.env 读取，在此统一导出。
 * 在 .env.local / .env.production 中配置对应变量。
 */

/** API 基础域名，例如 https://api.example.com */
export const apiUrl: string = import.meta.env.VITE_API_URL ?? ''

/** 普通接口路径前缀，例如 api */
export const apiAffix: string = import.meta.env.VITE_API_AFFIX ?? 'api'

/** 上传接口路径前缀，例如 upload */
export const uploadApiAffix: string = import.meta.env.VITE_UPLOAD_API_AFFIX ?? 'upload'
