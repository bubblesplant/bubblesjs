import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const toolDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolDirectory, '../../../..')
const evidencePath = resolve(toolDirectory, '../测试证据/运行时发布检查.json')
const appRequire = createRequire(resolve(repositoryRoot, 'apps/web/package.json'))
const vueRequire = createRequire(resolve(repositoryRoot, 'packages/i18n/vue/package.json'))
const distPaths = {
  core: resolve(repositoryRoot, 'packages/i18n/core/dist/index.js'),
  react: resolve(repositoryRoot, 'packages/i18n/react/dist/index.js'),
  vue: resolve(repositoryRoot, 'packages/i18n/vue/dist/index.js'),
}

/** 将异常转换为可归档的信息，避免写入无关调用栈。 */
function errorDetails(error) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  }
}

/** 使用已构建的公开入口复现语言加载乱序，不依赖计时器或网络。 */
async function checkLanguageSwitchRace(core) {
  const pending = new Map()
  const store = core.createI18n({
    locale: 'initial',
    message: { greeting: 'Initial' },
    /** 保存每次加载的完成方法，由检查工具明确控制完成顺序。 */
    loaderMessage: (locale) => new Promise((complete) => pending.set(locale, complete)),
  })
  const first = store.getState().loadLocale('slow')
  const second = store.getState().loadLocale('latest')
  pending.get('latest')({ greeting: 'Latest' })
  await second
  pending.get('slow')({ greeting: 'Stale' })
  await first

  return {
    requestOrder: ['slow', 'latest'],
    completionOrder: ['latest', 'slow'],
    expectedLocale: 'latest',
    actualLocale: store.getState().locale,
    actualTranslation: store.getState().tr('greeting'),
    problemReproduced: store.getState().locale !== 'latest',
  }
}

/** 确认一个实例的语言切换不会改变另一个实例的语言或词条。 */
async function checkInstanceIsolation(core) {
  const first = core.createI18n({
    locale: 'zh_CN',
    message: { greeting: '你好' },
    loaderMessage: async () => ({ greeting: 'Hello' }),
  })
  const second = core.createI18n({ locale: 'zh_CN', message: { greeting: '独立实例' } })
  await first.getState().loadLocale('en_US')

  return {
    first: { locale: first.getState().locale, translation: first.getState().tr('greeting') },
    second: { locale: second.getState().locale, translation: second.getState().tr('greeting') },
    passed: second.getState().locale === 'zh_CN' && second.getState().tr('greeting') === '独立实例',
  }
}

/** 检查缺失词条是否误读对象原型，以及携带插值参数时是否抛出异常。 */
function checkPrototypeMessageKeys(core) {
  const store = core.createI18n({ message: {} })
  const values = ['constructor', 'toString'].map((key) => {
    const result = store.getState().tr(key)
    return {
      key,
      expected: key,
      actualType: typeof result,
      returnedString: typeof result === 'string',
    }
  })
  let interpolationError = null
  try {
    store.getState().tr('constructor', { count: 1 })
  } catch (error) {
    interpolationError = errorDetails(error)
  }

  return {
    values,
    interpolationError,
    problemReproduced:
      values.some((result) => !result.returnedString) || interpolationError !== null,
  }
}

/** 检查未提供的插值参数是否仍按契约保留原占位符。 */
function checkPrototypeInterpolationKey(core) {
  const expected = 'Value: {toString}'
  const actual = core.formatMessage(expected, {})
  return { expected, actual, problemReproduced: actual !== expected }
}

/** 检查公开浅比较方法能否区分不同键且值均为 undefined 的对象。 */
function checkShallowObjectKeys(core) {
  const actual = core.shallowEqualObject({ first: undefined }, { second: undefined })
  return {
    inputDescription: '{ first: undefined } 与 { second: undefined }',
    expected: false,
    actual,
    problemReproduced: actual !== false,
  }
}

/** 使用真实 React 服务端渲染器检查国际化订阅是否提供服务器快照。 */
function checkReactSSR(core, reactAdapter, React, renderToString) {
  const store = core.createI18n({ locale: 'en_US' })
  /** 在服务端组件中读取完整国际化状态。 */
  function Example() {
    const state = reactAdapter.useI18nStore(store)
    return React.createElement('span', null, state.locale)
  }

  try {
    return {
      expected: '完成服务端渲染',
      html: renderToString(React.createElement(Example)),
      problemReproduced: false,
    }
  } catch (error) {
    return { expected: '完成服务端渲染', error: errorDetails(error), problemReproduced: true }
  }
}

/** 检查具名或内联对象 selector 的快照稳定性，以及状态更新后的实际 DOM。 */
async function checkReactObjectSelector({
  core,
  reactAdapter,
  React,
  createRoot,
  inlineSelector = false,
}) {
  const store = core.createI18n({ locale: 'en_US' })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const warnings = []
  const originalConsoleError = console.error
  let renderCount = 0
  let observedError = null
  let before = null
  let after = null

  /** 返回新的状态片段对象，复现公开 selector 类型允许的常见用法。 */
  function selectLocale(state) {
    return { locale: state.locale }
  }
  /** 订阅对象 selector，并统计初始渲染和状态变化后的渲染次数。 */
  function Example() {
    renderCount += 1
    const result = reactAdapter.useI18nStore(
      store,
      inlineSelector ? (state) => ({ locale: state.locale }) : selectLocale,
    )
    return React.createElement('span', null, result.locale)
  }

  console.error = (...items) => warnings.push(String(items[0]))
  try {
    await React.act(() => root.render(React.createElement(Example)))
    before = host.textContent
    await React.act(() => store.setState((state) => ({ ...state, locale: 'zh_CN' })))
    after = host.textContent
  } catch (error) {
    observedError = errorDetails(error)
  } finally {
    try {
      await React.act(() => root.unmount())
    } finally {
      console.error = originalConsoleError
      host.remove()
    }
  }

  return {
    expected: '稳定渲染，状态更新后 DOM 从 en_US 变为 zh_CN',
    selectorKind: inlineSelector ? 'inline' : 'named',
    stateUpdates: 1,
    before,
    after,
    renderCount,
    warnings,
    error: observedError,
    problemReproduced: observedError !== null || before !== 'en_US' || after !== 'zh_CN',
  }
}

/** 使用真实 Vue 渲染器检查 Provider 的 store prop 更换是否传递给后代。 */
async function checkVueStoreReplacement(core, vueAdapter, Vue) {
  const first = core.createI18n({ locale: 'first' })
  const second = core.createI18n({ locale: 'second' })
  const active = Vue.shallowRef(first)
  const Consumer = Vue.defineComponent({
    /** 在默认插槽后代中消费国际化语言。 */
    setup() {
      const { locale } = vueAdapter.useI18n()
      return () => Vue.h('span', locale.value)
    },
  })
  const app = Vue.createApp({
    /** 保留 Provider 实例，更新它接收的 store 属性。 */
    setup() {
      return () =>
        Vue.h(vueAdapter.I18nProvider, { store: active.value }, { default: () => Vue.h(Consumer) })
    },
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  try {
    app.mount(host)
    const before = host.textContent
    active.value = second
    await Vue.nextTick()
    const after = host.textContent
    return {
      before,
      expectedAfter: 'second',
      actualAfter: after,
      problemReproduced: after !== 'second',
    }
  } finally {
    app.unmount()
    host.remove()
  }
}

/** 单独记录工具执行异常，避免将环境失败错误地标成产品缺陷。 */
async function captureCheck(check) {
  try {
    return await check()
  } catch (error) {
    return { toolError: errorDetails(error) }
  }
}

/** 读取现有构建产物执行隔离检查，仅写入同功能目录的 JSON 证据。 */
async function main() {
  const { Window } = appRequire('happy-dom')
  const window = new Window()
  const globalKeys = [
    'window',
    'document',
    'navigator',
    'Element',
    'HTMLElement',
    'SVGElement',
    'Node',
    'IS_REACT_ACT_ENVIRONMENT',
  ]
  const originalDescriptors = new Map(
    globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  for (const key of globalKeys) {
    const value =
      key === 'window' ? window : key === 'IS_REACT_ACT_ENVIRONMENT' ? true : window[key]
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  }

  try {
    const core = await import(pathToFileURL(distPaths.core).href)
    const reactAdapter = await import(pathToFileURL(distPaths.react).href)
    const vueAdapter = await import(pathToFileURL(distPaths.vue).href)
    const React = appRequire('react')
    const { renderToString } = appRequire('react-dom/server')
    const { createRoot } = appRequire('react-dom/client')
    const Vue = vueRequire('vue')
    const artifacts = {}
    for (const [name, file] of Object.entries(distPaths)) {
      artifacts[name] = {
        path: file,
        sha256: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      }
    }
    const checks = {
      languageSwitchRace: await captureCheck(() => checkLanguageSwitchRace(core)),
      instanceIsolation: await captureCheck(() => checkInstanceIsolation(core)),
      prototypeMessageKeys: await captureCheck(() => checkPrototypeMessageKeys(core)),
      prototypeInterpolationKey: await captureCheck(() => checkPrototypeInterpolationKey(core)),
      shallowObjectKeys: await captureCheck(() => checkShallowObjectKeys(core)),
      reactSSR: await captureCheck(() => checkReactSSR(core, reactAdapter, React, renderToString)),
      reactObjectSelector: await captureCheck(() =>
        checkReactObjectSelector({ core, reactAdapter, React, createRoot }),
      ),
      reactInlineObjectSelector: await captureCheck(() =>
        checkReactObjectSelector({ core, reactAdapter, React, createRoot, inlineSelector: true }),
      ),
      vueProviderStoreReplacement: await captureCheck(() =>
        checkVueStoreReplacement(core, vueAdapter, Vue),
      ),
    }
    const report = {
      assessmentDate: '2026-10-09',
      executedAtUtc: new Date().toISOString(),
      command: 'node .spaces/04.界面与主题/国际化/工具/运行时发布检查.mjs',
      method:
        '直接导入当前 dist；使用真实 React SSR、React DOM、Vue 渲染器与 happy-dom；未安装依赖、未构建、未修改业务代码。',
      environment: {
        node: process.version,
        platform: process.platform,
        react: appRequire('react/package.json').version,
        reactDom: appRequire('react-dom/package.json').version,
        vue: vueRequire('vue/package.json').version,
        dependencyResolution: {
          appRequireBase: resolve(repositoryRoot, 'apps/web/package.json'),
          vueRequireBase: resolve(repositoryRoot, 'packages/i18n/vue/package.json'),
          happyDom: appRequire.resolve('happy-dom'),
          react: appRequire.resolve('react'),
          reactDomServer: appRequire.resolve('react-dom/server'),
          reactDomClient: appRequire.resolve('react-dom/client'),
          vue: vueRequire.resolve('vue'),
        },
      },
      artifacts,
      checks,
    }
    await mkdir(dirname(evidencePath), { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ evidencePath, checks }, null, 2))
    if (Object.values(checks).some((check) => check.toolError)) process.exitCode = 1
  } finally {
    await window.happyDOM.close()
    for (const [key, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

await main()
