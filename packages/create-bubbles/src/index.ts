// import colors from 'picocolors' // https://github.com/alexeyraspopov/picocolors
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as prompts from '@clack/prompts'
import spawn from 'cross-spawn'
import gradient from 'gradient-string' // https://github.com/bokub/gradient-string
import mri from 'mri' // http://github.com/lukeed/mri
import type { Framework } from './interface'

// const { blue, blueBright, cyan, green, greenBright, magenta, red, redBright, reset, yellow } =
//   colors // 终端输出添加颜色

const colorMap = {
  vue: gradient(['#42B883', '#42B883']),
  react: gradient(['#087EA4', '#087EA4']),
  taro: gradient(['#0000C2', '#fff']),
  nextjs: gradient(['#000', '#fff']),
  others: gradient(['#8B5CF6', '#A855F7']),
}

/**
 * process.argv 是 node index.js 前两个参数
 * 第一个参数是 node 可执行文件的路径
 * 第二个参数是当前执行的脚本文件的路径
 * 虽然最终使用的是 pnpm create bubbles 但最后都会指向bin 执行 node index.js
 */

const argv = mri<{
  template?: string
  help?: boolean
  overwrite?: boolean
}>(process.argv.slice(2), {
  alias: { h: 'help', t: 'template' }, // 缩写 比如 -h 就像变成 h:true help:true
  boolean: ['help', 'overwrite'], // 指定 help overwrite 为 boolean 类型
  string: ['template'], // 指定 template 为 string 类型
})

/** 执行命令的绝对路径 代指执行命令的地方 */
const cwd = process.cwd()

const helpMessage = `\
Usage: create-bubbles [OPTION]... [DIRECTORY]

Create a new Bubbles project in JavaScript or TypeScript.
With no arguments, start the CLI in interactive mode.

Options:
  -t, --template NAME        use a specific template

Available templates:
${colorMap.vue('vue-vp-eslint              vue')}
${colorMap.react('react-rsbuild-biome        react')}
${colorMap.react('vp-react                   react')}
${colorMap.react('vp-react-shadcn            react')}
${colorMap.react('vp-monorepo-react-nestjs   react')}
${colorMap.taro('taro-vue-eslint            taro')}
${colorMap.nextjs('nextjs-vinext-eslint      nextjs')}`

// const FRAMEWORK = [
//  {
//   name: 'vue'
//  }
// ]

/**
 * 去除空格并且替换掉末尾一个或者多个“/”
 * @param targetDir
 * @returns
 */
const formatTargetDir = (targetDir: string) => {
  return targetDir.trim().replace(/\/+$/g, '')
}

interface PkgInfo {
  name: string
  version: string
}

const pkgFromUserAgent = (userAgent?: string): PkgInfo | undefined => {
  if (!userAgent) return
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

/**
 * 要么没有文件要么只有一个.git 文件夹
 * @param path
 * @returns
 */
const isEmpty = (path: string) => {
  const files = fs.readdirSync(path)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

const emptyDir = async (dir: string) => {
  await Promise.all(
    fs
      .readdirSync(dir)
      .filter((file) => file !== '.git')
      .map((file) => fs.promises.rm(path.resolve(dir, file), { recursive: true, force: true })),
  )
}
/**
 * 验证包名是否满足以 @ - * ~ 字母 数字 开头 并且
 * 第一个?: 代表非捕获模式 第二个代表 可有可无
 * @scope/abc  abc
 * (?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?  => 匹配 @scope/
 * [a-z\d\-~][a-z\d\-._~]*  匹配 / 后面
 *
 * @param packageName
 * @returns
 */
const isValidPackageName = (packageName: string) => {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(packageName)
}

/**
 * 把不合法的包名元素替换掉
 * @param packageName
 * @returns
 */
const toValidPackageName = (packageName: string) => {
  return packageName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+g/, '-')
}

const FRAMEWORKS: Framework[] = [
  {
    name: 'vue',
    display: 'Vue',
    color: colorMap.vue,
    variants: [
      {
        name: 'vue-vp-eslint',
        display: 'vp + eslint',
        color: colorMap.vue,
      },
    ],
  },
  {
    name: 'react',
    display: 'React',
    color: colorMap.react,
    variants: [
      {
        name: 'react-rsbuild-biome',
        display: 'rsbuild-biome',
        color: colorMap.react,
      },
      {
        name: 'vp-react',
        display: 'vp-react',
        color: colorMap.react,
      },
      {
        name: 'vp-react-shadcn',
        display: 'vp-react-shadcn',
        color: colorMap.react,
      },
      {
        name: 'vp-monorepo-react-nestjs',
        display: 'vp-monorepo-react-nestjs',
        color: colorMap.react,
      },
    ],
  },
  {
    name: 'taro',
    display: 'Taro',
    color: colorMap.taro,
    variants: [
      {
        name: 'taro-vue-eslint',
        display: 'taro-vue + eslint',
        color: colorMap.taro,
      },
      {
        name: 'taro-react-oxc',
        display: 'taro-react + oxc',
        color: colorMap.taro,
      },
    ],
  },
  {
    name: 'nextjs',
    display: 'NextJS',
    color: colorMap.nextjs,
    variants: [
      {
        name: 'nextjs-vinext-eslint',
        display: 'nextjs + vinext + eslint',
        color: colorMap.nextjs,
      },
    ],
  },
  {
    name: 'others',
    display: 'Others',
    color: colorMap.others,
    variants: [
      {
        name: 'create-eletron-vite',
        display: 'Electron ↗',
        color: colorMap.others,
        customCommand: 'pnpm create electron-vite@latest TARGET_DIR',
      },
    ],
  },
]

const TEMPLATES = FRAMEWORKS.map((f) => f.variants.map((v) => `${v.name}`)).reduce(
  (a, b) => a.concat(b),
  [],
)

/**
 *
 * @param customCommand
 * @param pkgInfo  { name: 'pnpm', version: '10.0.0' }
 * @returns
 */
const getFullCustomCommand = (customCommand: string, pkgInfo?: PkgInfo) => {
  console.log('💦customCommand', customCommand, pkgInfo)
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm'
  const isYarn1 = pkgManager === 'yarn' && pkgInfo?.version.startsWith('1.')

  return (
    customCommand
      .replace(/^npm create (?:-- )?/, () => {
        if (pkgManager === 'bun') {
          return 'bun x create-'
        }

        if (pkgManager === 'pnpm') {
          return 'pnpm create '
        }

        /** 这里的 -- 时参数分隔符 前面的给 npm create 后面的 给 create-vite 这个脚手架  */
        return customCommand.startsWith('npm create -- ')
          ? `${pkgManager} create -- `
          : `${pkgManager} create `
      })
      // Only Yarn 1.x doesn't support `@version` in the `create` command
      .replace('@latest', () => (isYarn1 ? '' : '@latest'))
      .replace(/^npm exec/, () => {
        // Prefer `pnpm dlx`, `yarn dlx`, or `bun x`
        if (pkgManager === 'pnpm') {
          return 'pnpm dlx'
        }
        if (pkgManager === 'yarn' && !isYarn1) {
          return 'yarn dlx'
        }
        if (pkgManager === 'bun') {
          return 'bun x'
        }
        // Use `npm exec` in all other cases
        // including Yarn 1.x and other custom npm clients
        return 'npm exec'
      })
  )
}

/**
 * 历史遗留问题 npmjs 会把.gitignore 忽略掉，于是vite官方把.g
 */
const renameFiles: Record<string, string | undefined> = {
  _gitignore: '.gitignore',
}

const copyDir = (srcDir: string, destDir: string) => {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    const destFile = path.resolve(destDir, file)
    copy(srcFile, destFile)
  }
}

const copy = (src: string, dest: string) => {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else {
    fs.copyFileSync(src, dest)
  }
}

/**
 * 修改文件内容
 * @param file 文件路径
 * @param callback 修改内容的回调 参数是当前内容
 */
const editFile = (file: string, callback: (content: string) => string) => {
  const content = fs.readFileSync(file, 'utf-8')
  fs.writeFileSync(file, callback(content), 'utf-8')
}

/**
 * 对 react swc 的处理 就是将plugin-react 换成 plugin-react-swc
 * @param src 源目录
 * @param dest 目标目录
 */
const setupReactSwc = (root: string, isTs: boolean) => {
  const reactSwcPluginVersion = '4.0.1'
  editFile(path.resolve(root, 'package.json'), (content) => {
    return content.replace(
      /"@vitejs\/plugin-react": ".+?"/,
      `"@vitejs/plugin-react-swc": "^${reactSwcPluginVersion}"`,
    )
  })
  editFile(path.resolve(root, `vite.config.${isTs ? 'ts' : 'js'}`), (content) =>
    content.replace('@vitejs/plugin-react', '@vitejs/plugin-react-swc'),
  )
}

const init = async () => {
  console.log(argv)
  /**
   * 取的是那些没有 --key value的参数 这里代指模板
   * bun index.js template-vue -t vue -s 12321  template-react
   * {
   * _: [ "template-vue", "template-react" ],
   * t: "vue",
   * s: 12321,
   * template: "vue",
   * }
   */
  const argTargetDir = argv._[0] ? formatTargetDir(argv._[0]) : undefined

  const argTemplate = argv.template
  const argOverwrite = argv.overwrite

  const defaultTargetDir = 'bubbles-project'

  // 1. 先看有没有help 参数
  const help = argv.help
  if (help) {
    console.log(helpMessage)
    return
  }

  /**
   * 获取用户执行命令的包管理工具的详细信息 包含 name 和 版本
   *
   * - bun x  node packages/create-bubbles-tsdown/index.js
   * - pnpm exec node packages/create-bubbles-tsdown/index.js
   * - 或 npm exec node packages/create-bubbles-tsdown/index.js
   */
  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent) // 获取用户
  const cancel = () => prompts.cancel('Operation cancelled')

  // 2. 创建交互 让用户输入项目名 并提共默认值
  /** 项目名 */
  let targetDir = argTargetDir
  if (!targetDir) {
    const projectName = await prompts.text({
      message: 'Project name',
      defaultValue: defaultTargetDir,
      placeholder: defaultTargetDir,
      validate: (value) => {
        return (value || []).length === 0 || formatTargetDir(value || '').length > 0
          ? undefined
          : 'Invalid project name'
      },
    })
    if (prompts.isCancel(projectName)) return cancel()
    targetDir = formatTargetDir(projectName)
  }

  // 2. 如果文件夹存在不为空
  if (fs.existsSync(targetDir) && !isEmpty(targetDir)) {
    const overwrite = argOverwrite
      ? 'yes'
      : await prompts.select({
          message:
            targetDir === '.'
              ? 'Current directory'
              : `Target directory "${targetDir}" is not empty. Please choose how to proceed:`,
          options: [
            {
              label: `${colorMap.vue('Cancel operation')}`,
              value: 'no',
            },
            {
              label: 'Remove existing files and continue',
              value: 'yes',
            },
            {
              label: 'Ignore files and continue',
              value: 'ignore',
            },
          ],
        })
    // 处理 目录中取消
    if (prompts.isCancel(overwrite)) return cancel()
    switch (overwrite) {
      case 'yes':
        emptyDir(targetDir)
        break
      case 'no':
        cancel()
        return
    }
  }

  // 3. 获取包名 package.json name
  // console.log('💦targetDir', targetDir)
  // console.log('💦targetDir', path.resolve(targetDir))
  // console.log('💦targetDir', path.basename(path.resolve(targetDir)))
  /** 提取绝对路径最后的path 与 targetDir 不同 因为 targetDir 可以输入 xxx/xxx */
  let packageName = path.basename(path.resolve(targetDir))
  if (!isValidPackageName(packageName)) {
    const packageNameResult = await prompts.text({
      message: 'Package name is invalid. please input again:',
      defaultValue: toValidPackageName(packageName),
      placeholder: toValidPackageName(packageName),
      validate(dir) {
        if (!isValidPackageName(dir)) {
          return 'Invalid package.json name'
        }
      },
    })
    if (prompts.isCancel(packageNameResult)) return cancel()
    packageName = packageNameResult
  }

  // 4. 选择模板
  let template = argTemplate
  let hasInvalidArgTemplate = false

  /** 输入的-t 模板不能存在 */
  if (argTemplate && !TEMPLATES.includes(argTemplate)) {
    template = undefined
    hasInvalidArgTemplate = true
  }
  if (!template) {
    const framework = await prompts.select({
      message: hasInvalidArgTemplate
        ? `"${argTemplate}" isn't a valia template. please choose from below:`
        : 'Select a framework',
      options: FRAMEWORKS.map((framework) => {
        const frameworkColor = framework.color
        return {
          label: frameworkColor(framework.display),
          value: framework,
        }
      }),
    })
    if (prompts.isCancel(framework)) return cancel()

    console.log('💦pkgInfo', pkgInfo)

    const variant = await prompts.select({
      message: 'Select a variant:',
      options: framework.variants.map((variant) => {
        const variantColor = variant.color
        const command = variant.customCommand
          ? getFullCustomCommand(variant.customCommand, pkgInfo).replace(/ TARGET_DIR$/, '')
          : undefined
        return {
          label: variantColor(variant.display || variant.name),
          value: variant.name,
          hint: command,
        }
      }),
    })
    if (prompts.isCancel(variant)) return cancel()
    template = variant
  }

  /** 合起来就是 项目文件夹的 绝对路径  */
  const root = path.join(cwd, targetDir)
  // recursive 递归 是防止用户输入的是 targetDir 是个多级目录 比如 abc/template-project
  fs.mkdirSync(root, { recursive: true })

  // determine template
  let isReactSwc = false
  if (template.includes('-swc')) {
    isReactSwc = true
    template = template.replace('-swc', '')
  }

  /**
   * 用户输入命令的包管理工具
   */
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm'

  const { customCommand } =
    FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ?? {}

  if (customCommand) {
    const fullCustomCommand = getFullCustomCommand(customCommand, pkgInfo)
    const [command, ...args] = fullCustomCommand.split(' ')

    // we replace TARGET_DIR here
    const replacedArgs = args.map((arg) => arg.replace('TARGET_DIR', () => targetDir))

    console.log('💦replacedArgs', replacedArgs)

    /** 这里的  inherit 表示继承父进程的输入输出  */
    const { status } = spawn.sync(command, replacedArgs, { stdio: 'inherit' })
    process.exit(status ?? 0)
  }

  prompts.log.step(`scaffolding project in ${root}...`)

  /** 选则的模板地址  */
  const templateDir = path.resolve(fileURLToPath(import.meta.url), '../..', `template-${template}`)
  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file)
    if (content) {
      fs.writeFileSync(targetPath, content)
    } else {
      copy(path.join(templateDir, file), targetPath)
    }
  }

  const files = fs.readdirSync(templateDir)
  for (const file of files) {
    if (file !== 'package.json') {
      write(file)
    }
  }

  // package.json 的 name 取用户输入的
  const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, 'package.json'), 'utf-8'))
  pkg.name = packageName
  /** null => replacer 主要是用于序列化的时候 做一些操作  数组 每一个属性都会执行该函数 如果是数组就是只有这些属性会留下
   * 2 代表 缩进级别
   */
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

  if (isReactSwc) {
    setupReactSwc(root, template.endsWith('-ts'))
  }

  let doneMessage = ''

  /** 克隆文件夹之后 目录的 的相对路径 其实就是 root 和 cwd 的差值  */
  const cdProjectName = path.relative(cwd, root)
  console.log('💦cwd', cwd)
  console.log('💦root', root)
  console.log('💦cdProjectName', cdProjectName)

  doneMessage += `Done. Now run:\n`
  if (root !== cwd) {
    doneMessage += `\n cd ${cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName} `
  }
  switch (pkgManager) {
    case 'yarn':
      doneMessage += `\n yarn`
      doneMessage += `\n yarn dev`
      break
    default:
      doneMessage += gradient(['pink', 'white'])(`\n  ${pkgManager} install`)
      doneMessage += gradient(['pink', 'white'])(`\n  ${pkgManager} run dev`)
      break
  }

  // 为什么不用 console.log 因为 prompts
  prompts.outro(doneMessage)
}

init().catch((e) => {
  console.error('💦', e)
})
