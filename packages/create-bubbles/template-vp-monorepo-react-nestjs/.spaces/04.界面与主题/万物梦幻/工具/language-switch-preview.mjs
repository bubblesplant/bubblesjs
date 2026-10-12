import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const featureDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectDir = resolve(featureDir, '../../..')
const webRequire = createRequire(resolve(projectDir, 'apps/web/package.json'))
const dependencyDir = process.argv[2]
if (!dependencyDir) throw new Error('请传入 Codex 配置的 Node 依赖运行时目录。')
const runtimeRequire = createRequire(resolve(dependencyDir, 'package.json'))
const { chromium } = runtimeRequire('playwright')
const { createElement } = webRequire('react')
const { renderToStaticMarkup } = webRequire('react-dom/server')
const { TranslationOutlined, SearchOutlined, DownOutlined, SwapOutlined, CheckOutlined } =
  webRequire('@ant-design/icons')
const icons = { TranslationOutlined, SearchOutlined, DownOutlined, SwapOutlined, CheckOutlined }

// 以下语言仅展示面板扩展能力，不添加或声明实际产品支持的语言。
const languages = [
  { locale: 'zh-Hans', native: '简体中文', label: '中文（简体）', selected: true },
  { locale: 'zh-Hant', native: '繁體中文', label: '中文（繁体）' },
  { locale: 'en', native: 'English', label: '英语' },
  { locale: 'ja', native: '日本語', label: '日语' },
  { locale: 'ko', native: '한국어', label: '韩语' },
  { locale: 'fr', native: 'Français', label: '法语' },
  { locale: 'de', native: 'Deutsch', label: '德语' },
  { locale: 'ar', native: 'العربية', label: '阿拉伯语' },
  { locale: 'es', native: 'Español', label: '西班牙语' },
  { locale: 'pt', native: 'Português', label: '葡萄牙语' },
  { locale: 'ru', native: 'Русский', label: '俄语' },
  { locale: 'th', native: 'ภาษาไทย', label: '泰语' },
]

const proposals = [
  {
    variant: 'A',
    title: '轻量列表',
    description: '紧凑、直接，点选即切换',
    caption: '单列原文名称 · 超出后滚动',
  },
  {
    variant: 'B',
    title: '双列面板',
    description: '更易浏览，语言名称更清楚',
    caption: '原文＋辅助名称 · 双列排列',
  },
  {
    variant: 'C',
    title: '可搜索列表',
    description: '语言较多时，定位更方便',
    caption: '搜索或滚动 · 点选即切换',
  },
]

const scopes = [
  { type: 'workspace', title: '工作区', label: '', name: '' },
  { type: 'company', title: '企业级', label: '企业空间', name: '示例企业' },
  { type: 'project', title: '项目级', label: '项目空间', name: '示例企业 / 月光计划' },
]

/** 复用项目现有 Ant Design 图标，不新增或替换产品 SVG 资产。 */
function icon(name) {
  return renderToStaticMarkup(createElement(icons[name], { 'aria-hidden': true }))
}

/** 页头只显示用户指定的翻译图标；展开状态仅改变颜色，不改变布局几何。 */
function languageTrigger({ expanded = false } = {}) {
  return `<button type="button" class="locale-trigger ${expanded ? 'expanded' : ''}" aria-label="切换语言" aria-haspopup="menu" aria-expanded="${expanded}">${icon('TranslationOutlined')}</button>`
}

/** 保留现有行星标记与万物字标，三种候选使用相同品牌。 */
function brand() {
  return '<div class="brand"><span class="brand-mark" aria-hidden="true"></span><span class="wordmark">万物<small>WANWU</small></span></div>'
}

/** 展示共用头像入口，紧凑示意中隐藏姓名以便比较语言面板。 */
function accountTrigger({ compact = false } = {}) {
  return `<button type="button" class="account-trigger" aria-label="账号菜单"><span class="avatar">林</span>${compact ? '' : '<span>林间</span>'}${icon('DownOutlined')}</button>`
}

/** 绘制作用域页头；企业和项目保留独立切换空间，语言入口始终只有图标。 */
function headerStrip({ scope, compact = false, expanded = false }) {
  const context =
    scope.type === 'workspace'
      ? ''
      : `<div class="context ${scope.type}"><span class="scope-dot"></span><span class="scope-type">${scope.label}</span><strong>${scope.name}</strong></div>`
  const switchSpace =
    scope.type === 'workspace'
      ? ''
      : `<button type="button" class="space-switch">${icon('SwapOutlined')}<span>切换空间</span></button>`
  return `<div class="product-header ${compact ? 'compact' : ''}">${brand()}${context}<div class="header-actions">${languageTrigger({ expanded })}${switchSpace}<span class="divider"></span>${accountTrigger({ compact })}</div></div>`
}

/** 输出原生语言名称、当前语言勾选和按候选类型展示的辅助名称。 */
function languageOption({ language, variant }) {
  const secondary = variant === 'A' ? '' : `<span class="language-caption">${language.label}</span>`
  return `<button type="button" class="language-option ${language.selected ? 'selected' : ''}" role="menuitemradio" aria-checked="${Boolean(language.selected)}"><span class="language-copy"><bdi class="language-native" lang="${language.locale}">${language.native}</bdi>${secondary}</span><span class="check-slot">${language.selected ? icon('CheckOutlined') : ''}</span></button>`
}

/** 生成三种可扩展语言选择层，搜索框仅作静态样稿展示。 */
function languagePanel(variant) {
  const heading =
    variant === 'A'
      ? ''
      : '<div class="panel-heading"><span>选择语言</span><small>Language</small></div>'
  const search =
    variant === 'C'
      ? `<div class="search-field">${icon('SearchOutlined')}<input aria-label="搜索语言" placeholder="搜索语言" readonly /></div>`
      : ''
  return `<div class="language-panel variant-${variant}">${heading}${search}<div class="language-list" role="menu" aria-label="语言选择">${languages.map((language) => languageOption({ language, variant })).join('')}</div></div>`
}

/** 在相同页面与相同图标位置展示各候选展开后的外观，避免入口差异干扰比较。 */
function proposal({ variant, title, description, caption }) {
  return `<section class="proposal"><h2><span>${variant}</span> ${title}</h2><p class="proposal-description">${description}</p><div class="stage">${headerStrip({ scope: scopes[0], compact: true, expanded: true })}<div class="stage-body"><div class="page-content"><p class="page-eyebrow">WORKSPACES</p><h3>我的工作空间</h3><div class="ghost-card"><span>示例企业</span><small>企业空间</small></div><div class="ghost-card"><span>月光计划</span><small>项目空间</small></div></div>${languagePanel(variant)}</div></div><p class="proposal-caption">${caption}</p></section>`
}

/** 构建本地三方案设计板；语言和账号均为示例，不连接产品 API。 */
function createPreview() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>万物多语言选择设计预览</title><style>
    :root { --ink:#342b49; --muted:#8a8098; --accent:#7660aa; --line:#e7e0ef; --selected:#f1ebf9; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:#f7f5fb; font:14px/1.5 'Segoe UI','Microsoft YaHei',sans-serif; -webkit-font-smoothing:antialiased; }
    button,input { font:inherit; color:inherit; }
    button { cursor:default; }
    .anticon { display:inline-flex; align-items:center; justify-content:center; vertical-align:middle; }
    .board { width:1500px; padding:42px 48px 28px; background:radial-gradient(ellipse at 95% 0%,#ede6f870,transparent 43%),#f9f7fc; }
    .intro { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:34px; }
    .eyebrow { margin:0 0 10px; color:var(--muted); font-size:12px; letter-spacing:1.4px; }
    h1 { font-size:30px; font-weight:600; line-height:1.4; margin:0; letter-spacing:-.5px; }
    .intro-note { margin:0 0 4px; font-size:13px; color:var(--muted); }
    .columns { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:28px; }
    h2 { margin:0; font-size:21px; font-weight:600; }
    h2>span { margin-right:5px; color:#9b8ab7; font-size:17px; font-weight:500; }
    .proposal-description { margin:6px 0 18px; font-size:13px; color:var(--muted); }
    .stage { border:1px solid #e8e1f0; border-radius:12px; overflow:hidden; background:#f6f3fa; }
    .product-header { display:flex; gap:20px; align-items:center; height:62px; min-width:0; padding:0 22px; border:1px solid #e8e1f0; border-radius:9px; background:#faf8fd; }
    .product-header.compact { height:58px; border:0; border-bottom:1px solid #e8e1f0; border-radius:0; padding:0 16px; gap:12px; }
    .brand { display:flex; gap:10px; flex-shrink:0; align-items:center; }
    .brand-mark { position:relative; width:25px; height:25px; flex:0 0 25px; border:1px solid #ffffffe6; border-radius:50%; background:radial-gradient(circle at 28% 24%,#fff 0,#ede3fb 28%,#bcb0eb 65%,#dceefa); box-shadow:inset -3px -4px 8px #ac9fd84d,0 4px 14px #8d79c333; }
    .brand-mark:before { position:absolute; inset:7px -5px; border:1px solid #a796d6; border-top-color:#ffffffb3; border-radius:50%; content:''; transform:rotate(-34deg); }
    .brand-mark:after { position:absolute; top:0; right:-3px; width:4px; height:4px; border-radius:50%; background:#ac99da; content:''; }
    .wordmark { font:600 23px/1.1 STSong,SimSun,serif; letter-spacing:2px; }
    .wordmark small { display:block; margin-top:4px; font:6px/1.2 'Segoe UI',sans-serif; color:var(--muted); letter-spacing:2px; }
    .header-actions { display:flex; align-items:center; gap:12px; margin-left:auto; flex-shrink:0; }
    .locale-trigger { display:flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0; border:1px solid transparent; border-radius:6px; color:#5a4c70; background:transparent; box-shadow:0 2px 6px transparent; transition:color 160ms,background-color 160ms,border-color 160ms; }
    .locale-trigger>.anticon { font-size:16px; }
    .locale-trigger:hover,.locale-trigger.expanded { color:var(--accent); background-color:#ece6f6; }
    .divider { width:1px; height:20px; background:#e4ddeb; }
    .account-trigger { display:flex; align-items:center; gap:8px; height:34px; padding:0; border:1px solid transparent; border-radius:6px; background:transparent; font-size:12px; }
    .account-trigger>.anticon { font-size:8px; color:#978aa7; }
    .avatar { display:flex; align-items:center; justify-content:center; width:27px; height:27px; border:1px solid #fff; border-radius:50%; color:#8266b0; background:#e8e0f5; font-size:14px; }
    .stage-body { position:relative; height:525px; padding-top:15px; }
    .page-content { position:absolute; inset:34px 25px; opacity:.37; }
    .page-eyebrow { margin:0; font-size:9px; color:#b9afc8; letter-spacing:1.4px; }
    h3 { margin:6px 0 25px; font-size:22px; font-weight:500; color:#9889ad; }
    .ghost-card { height:90px; padding:20px; margin:0 0 16px; border:1px solid #ded7e7; border-radius:10px; background:#fff8; }
    .ghost-card span { display:block; font-size:13px; color:#a294b7; }
    .ghost-card small { display:block; margin-top:4px; color:#b8acc8; font-size:10px; }
    .language-panel { position:relative; margin-left:auto; margin-right:78px; background:#ffffff; border:1px solid #e7e0ee; border-radius:11px; padding:7px; box-shadow:0 8px 24px #35224912; }
    .variant-A { width:232px; }
    .variant-B { width:332px; padding:11px; }
    .variant-C { width:292px; padding:11px; }
    .language-list { max-height:360px; overflow:auto; scrollbar-width:thin; scrollbar-color:#d9d0e7 transparent; }
    .language-list::-webkit-scrollbar { width:4px; }
    .language-list::-webkit-scrollbar-thumb { background:#d9d0e7; border-radius:5px; }
    .language-list::-webkit-scrollbar-track { background:transparent; }
    .language-option { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; height:36px; padding:0 12px; border:1px solid transparent; border-radius:6px; background:transparent; text-align:left; transition:color 160ms,background-color 160ms,border-color 160ms; }
    .language-option:hover { background-color:#f8f5fc; }
    .language-option.selected { color:var(--accent); background-color:var(--selected); }
    .language-copy { display:flex; flex-direction:column; min-width:0; }
    .language-native { font-size:13px; line-height:19px; font-weight:400; white-space:nowrap; }
    .check-slot { width:14px; height:16px; flex:0 0 14px; color:var(--accent); font-size:13px; }
    .language-caption { font-size:11px; line-height:17px; color:#9b90a9; white-space:nowrap; }
    .panel-heading { display:flex; justify-content:space-between; align-items:center; padding:3px 4px 12px; font-size:13px; }
    .panel-heading small { font-size:10px; color:#a79caf; }
    .variant-B .language-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; max-height:268px; }
    .variant-B .language-option { height:60px; padding:9px 10px; border-color:#f0ebf5; border-radius:7px; }
    .variant-B .language-option.selected { border-color:#d9cdec; }
    .variant-B .language-native { font-size:13px; }
    .search-field { display:flex; align-items:center; gap:8px; height:34px; margin:0 0 10px; padding:0 10px; border:1px solid #ece5f2; border-radius:6px; background:#f9f7fc; color:#a598b5; }
    .search-field>.anticon { font-size:13px; }
    .search-field input { min-width:0; width:100%; padding:0; border:0; outline:none; background:transparent; font-size:12px; }
    .search-field input::placeholder { color:#ad9fbd; }
    .variant-C .language-list { max-height:384px; }
    .variant-C .language-option { height:48px; padding:5px 10px; }
    .proposal-caption { margin:13px 0 0; text-align:center; color:#8e819c; font-size:12px; }
    button:focus-visible { outline:2px solid #9880cc; outline-offset:2px; }
    .shared { margin-top:34px; padding-top:24px; border-top:1px solid var(--line); }
    .shared-intro { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .shared-intro h3 { margin:0; color:var(--ink); font-size:17px; font-weight:500; }
    .shared-intro p { margin:0; color:var(--muted); font-size:12px; }
    .scope-example { display:grid; grid-template-columns:64px 1fr; align-items:center; gap:14px; margin-bottom:10px; }
    .scope-example>span { color:var(--muted); font-size:12px; }
    .context { display:flex; align-items:center; gap:8px; min-width:0; padding:5px 10px; border:1px solid #e7dfef; border-radius:18px; background:#ffffff7a; }
    .context strong { font-size:11px; font-weight:400; }
    .scope-type { font-size:10px; color:#9b8eaa; }
    .scope-dot { width:5px; height:5px; border-radius:50%; background:#84a8ba; }
    .project .scope-dot { background:#ba87aa; }
    .space-switch { display:flex; align-items:center; justify-content:center; gap:6px; height:32px; padding:0 11px; border:1px solid #e5dced; border-radius:6px; background:#ffffffa3; font-size:11px; }
    .space-switch>.anticon { font-size:13px; }
    .board-footer { margin:20px 0 0; color:#ac9fba; font-size:10px; text-align:right; }
    @media (prefers-reduced-motion:reduce) { button { transition:none; } }
  </style></head><body><main class="board"><div class="intro"><div><p class="eyebrow">万物 · 页头语言选择</p><h1>一个小图标，三种展开方式</h1></div><p class="intro-note">点击图标 → 选择语言</p></div><div class="columns">${proposals.map(proposal).join('')}</div><div class="shared"><div class="shared-intro"><h3>三个页面共用同一个入口</h3><p>工作区 / 企业级 / 项目级</p></div>${scopes.map((scope) => `<div class="scope-example"><span>${scope.title}</span>${headerStrip({ scope })}</div>`).join('')}</div><p class="board-footer">视觉候选 · 语言为展示多语言能力的示例，具体清单以产品配置为准</p></main></body></html>`
}

/** 将静态三方案保存为 HTML 与 PNG，检查控件几何及语言面板的滚动扩展能力。 */
async function main() {
  const uiDir = resolve(featureDir, 'ui')
  await mkdir(uiDir, { recursive: true })
  const htmlPath = resolve(uiDir, 'language-switch-options.html')
  const pngPath = resolve(uiDir, 'language-switch-options.png')
  await writeFile(htmlPath, createPreview(), 'utf8')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1250 },
      deviceScaleFactor: 1,
    })
    await page.goto(pathToFileURL(htmlPath).href)
    await page.evaluate(() => document.fonts.ready)
    const overflow = await page
      .locator('button, h1, h2, .panel-heading')
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent.trim()),
      )
    if (overflow.length) throw new Error(`控件存在溢出：${overflow.join('、')}`)
    const triggers = await page.locator('.locale-trigger').evaluateAll((elements) =>
      elements.map((element) => ({
        text: element.textContent.trim(),
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    )
    if (triggers.some((trigger) => trigger.text || trigger.width !== 32 || trigger.height !== 32))
      throw new Error('语言入口未满足纯图标、固定热区要求。')
    const panels = await page.locator('.language-list').evaluateAll((elements) =>
      elements.map((element) => ({
        items: element.children.length,
        scrollable: element.scrollHeight > element.clientHeight,
      })),
    )
    if (panels.some((panel) => panel.items !== 12 || !panel.scrollable))
      throw new Error('语言面板未展示多语言滚动扩展能力。')
    const dimensions = await page.locator('.board').boundingBox()
    await page.locator('.board').screenshot({ path: pngPath })
    console.log(
      JSON.stringify(
        {
          htmlPath,
          pngPath,
          width: dimensions.width,
          height: Math.ceil(dimensions.height),
          overflow,
          triggers,
          panels,
        },
        null,
        2,
      ),
    )
  } finally {
    await browser.close()
  }
}

await main()
