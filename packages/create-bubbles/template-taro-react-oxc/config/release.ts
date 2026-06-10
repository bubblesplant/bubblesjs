import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 获取package.json中的版本号
 */
function getPackageVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), 'package.json')
    const packageContent = fs.readFileSync(packagePath, 'utf8')
    const packageData = JSON.parse(packageContent)
    return packageData.version || '1.0.0'
  } catch (error) {
    console.warn('⚠️ 获取package.json版本号失败，使用默认版本 1.0.0')
    return '1.0.0'
  }
}

/**
 * 获取最新的Git提交信息
 */
function getLatestCommitMessage(): string {
  try {
    const message = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim()
    return message || '版本更新'
  } catch (error) {
    console.warn('⚠️ 获取Git提交信息失败，使用默认描述')
    return '版本更新'
  }
}

/**
 * 获取当前分支名
 */
function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch (error) {
    return 'unknown'
  }
}

/**
 * 获取提交者信息
 */
function getCommitAuthor(): string {
  try {
    return execSync('git log -1 --pretty=%an', { encoding: 'utf8' }).trim()
  } catch (error) {
    return 'unknown'
  }
}

/**
 * CI插件配置函数
 * 自动读取版本号和提交信息
 * @returns CIOptions配置
 */
export const CIPluginFn = async () => {
  // 动态获取版本信息
  const version = getPackageVersion()
  const commitMessage = getLatestCommitMessage()
  const branch = getCurrentBranch()
  const author = getCommitAuthor()

  // 构建发布描述
  const desc = `${commitMessage}\n\n📦 版本: ${version}\n🌿 分支: ${branch}\n👤 提交者: ${author}\n⏰ 发布时间: ${new Date().toLocaleString('zh-CN')}`

  console.log('🚀 CI发布配置:')
  console.log(`📦 版本号: ${version}`)
  console.log(`📝 提交信息: ${commitMessage}`)
  console.log(`🌿 分支: ${branch}`)
  console.log(`👤 提交者: ${author}`)

  /**
   * @typedef { import("@tarojs/plugin-mini-ci").CIOptions } CIOptions
   * @type {CIOptions}
   */
  return {
    weapp: {
      appid: 'xxx',
      privateKeyPath: 'xxx',
    },
    // tt: {
    //   email: '字节小程序邮箱',
    //   password: '字节小程序密码',
    // },
    // alipay: {
    //   appid: '支付宝小程序appid',
    //   toolId: '工具id',
    //   privateKeyPath: '密钥文件相对项目根目录的相对路径，例如 key/pkcs8-private-pem',
    // },
    // dd: {
    //   appid: '钉钉小程序appid,即钉钉开放平台后台应用管理的 MiniAppId 选项',
    //   token: '令牌，从钉钉后台获取',
    // },
    // swan: {
    //   token: '鉴权需要的token令牌',
    // },
    // 动态版本号
    version,
    // 动态版本发布描述
    desc,
  }
}
