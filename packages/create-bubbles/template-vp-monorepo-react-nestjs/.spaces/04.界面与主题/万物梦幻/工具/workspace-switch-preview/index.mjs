import { mkdir, writeFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const featureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const projectDir = resolve(featureDir, '../../..')
const dependencyDir = process.argv[2]
if (!dependencyDir) throw new Error('请传入 Codex 配置的 Node 依赖运行时目录。')
const runtimeRequire = createRequire(resolve(dependencyDir, 'package.json'))
const webRequire = createRequire(resolve(projectDir, 'apps/web/package.json'))
const { chromium } = runtimeRequire('playwright')
const { createElement } = webRequire('react')
const { renderToStaticMarkup } = webRequire('react-dom/server')
const { SwapOutlined, TranslationOutlined, DownOutlined, CheckOutlined, BankOutlined, FolderOutlined } =
  webRequire('@ant-design/icons')
const icons = { SwapOutlined, TranslationOutlined, DownOutlined, CheckOutlined, BankOutlined, FolderOutlined }

// 仅用于视觉比较，不读取真实空间，不接入路由或业务接口。
const proposals = [
  { variant: 'A', title: '右侧小图标', caption: '入口最轻，点击图标展开空间列表' },
  { variant: 'B', title: '当前空间名称', caption: '名称与切换合成一个紧凑胶囊' },
  { variant: 'C', title: '左侧空间入口', caption: '点击当前空间切换，右侧保留语言和账户', recommended: true },
]
const spaces = [
  { name: '星屿科技', type: 'company', selected: true },
  { name: '云川设计', type: 'company' },
  { name: '星屿官网', type: 'project', company: '星屿科技' },
  { name: '运营后台', type: 'project', company: '星屿科技' },
]

/** 复用产品现有 Ant Design 图标，使预览与真实头部保持一致。 */
function icon(name) {
  return renderToStaticMarkup(createElement(icons[name], { 'aria-hidden': true }))
}

/** 保留现有行星品牌、字标和紧凑尺寸。 */
function brand() {
  return '<div class="brand"><span class="planet"></span><span class="wordmark">万物<small>WANWU</small></span></div>'
}

/** 语言和账户仅作为静态参照，不承担真实切换或账号操作。 */
function accountActions() {
  return `<button class="language" type="button" aria-label="切换语言">${icon('TranslationOutlined')}</button><button class="account" type="button" aria-label="账号菜单"><span class="avatar">林</span><span>林间</span>${icon('DownOutlined')}</button>`
}

/** 展示当前项及项目所属企业，四个示例空间不显示搜索框。 */
function spaceRow(space) {
  return `<button type="button" class="space-row ${space.selected ? 'selected' : ''}" role="menuitemradio" aria-checked="${Boolean(space.selected)}"><span class="space-icon ${space.type}">${icon(space.type === 'company' ? 'BankOutlined' : 'FolderOutlined')}</span><span class="space-copy"><span class="space-name">${space.name}</span>${space.company ? `<small>${space.company}</small>` : ''}</span><span class="row-end">${space.selected ? `<small>当前</small>${icon('CheckOutlined')}` : ''}</span></button>`
}

/** 所有候选复用同一面板内容，让比选聚焦在入口位置与表现。 */
function popover() {
  return `<div class="popover"><div class="popover-heading">切换空间</div><div class="space-group"><p>企业空间</p><div role="menu" aria-label="企业空间">${spaces.filter((space) => space.type === 'company').map(spaceRow).join('')}</div></div><div class="space-group"><p>项目空间</p><div role="menu" aria-label="项目空间">${spaces.filter((space) => space.type === 'project').map(spaceRow).join('')}</div></div></div>`
}

/** 每版只提供一个空间入口；Popover 为常开静态预览，不修改真实行为。 */
function switcher(variant) {
  const copy = variant === 'A'
    ? icon('SwapOutlined')
    : `${icon('BankOutlined')}${variant === 'C' ? '<span class="scope">企业空间</span><span class="slash">/</span>' : ''}<span class="current-name">星屿科技</span>${icon('DownOutlined')}`
  return `<div class="switcher switcher-${variant}"><button type="button" class="switch-trigger" aria-label="切换空间" aria-expanded="true">${copy}</button>${popover()}</div>`
}

/** 展示三种候选的整行头部，C 将左侧上下文合并为切换器。 */
function header(variant) {
  const context = variant === 'A'
    ? '<div class="static-context"><span class="scope-dot"></span><span>企业空间</span><strong>星屿科技</strong></div>'
    : variant === 'B' ? '<span class="plain-context">企业空间</span>' : switcher(variant)
  return `<header class="product-header">${brand()}${context}<div class="header-actions">${variant === 'C' ? '' : switcher(variant)}${accountActions()}</div></header>`
}

/** 在一致的企业工作台背景上展示候选入口和面板的相对位置。 */
function proposal({ variant, title, caption, recommended }) {
  return `<section class="proposal"><div class="proposal-heading"><h2><span class="proposal-letter">${variant}</span>${title}${recommended ? '<span class="recommended">推荐</span>' : ''}</h2><p>${caption}</p></div><div class="stage">${header(variant)}<div class="dashboard"><aside><div class="sidebar-current">企业工作台</div><div>企业资料</div><div>企业成员</div><div>项目管理</div></aside><div class="page-content"><h3>企业工作台</h3><p>查看当前身份，选择你需要的管理功能。</p><div class="content-card"><div class="data-row"><span>当前用户</span><strong>林间</strong><span>工作空间</span><strong>企业</strong></div><div class="data-row"><span>当前身份</span><span class="role-label">企业管理员</span><span>所属企业</span><strong>星屿科技</strong></div></div><div class="feature-card"><strong>可用功能</strong><div>企业资料<span>企业成员</span><span>项目管理</span></div></div></div></div></div></section>`
}

/** 构建独立设计板，品牌与色彩依据现有万物梦幻头部，不连接产品服务。 */
function createPreview() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>切换空间 · UI 候选</title><style>
    :root{--accent:#8c72c5;--ink:#392f53;--muted:#837597;--line:#e8e0f4;--selected:#efe8fa;--header:#fbf8fe}
    *{box-sizing:border-box}body{margin:0;background:#f7f5fb;color:var(--ink);font-family:"Microsoft YaHei","Segoe UI",sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
    button{font:inherit;color:inherit;border:1px solid transparent;background:transparent;padding:0;cursor:default}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    .anticon{display:inline-flex;align-items:center;justify-content:center;line-height:1}.anticon svg{width:1em;height:1em;fill:currentColor}
    .board{width:1440px;padding:36px 40px 30px}.intro{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}.eyebrow{font-size:12px;color:var(--muted);margin:0 0 8px;letter-spacing:2px}h1{font-size:28px;font-weight:600;letter-spacing:1px;margin:0}.intro-note{font-size:13px;color:var(--muted);margin:0 0 4px}
    .proposal{margin-top:24px}.proposal-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.proposal-heading h2{margin:0;display:flex;align-items:center;gap:12px;font-size:18px;font-weight:600}.proposal-letter{display:flex;align-items:center;justify-content:center;border:1px solid #e3dbf1;color:var(--accent);background:#f0eafa;width:30px;height:30px;border-radius:9px;font-size:15px;font-family:"Segoe UI",sans-serif}.proposal-heading p{margin:0;color:var(--muted);font-size:13px}.recommended{font-size:11px;line-height:20px;padding:0 8px;border:1px solid #d9ccef;border-radius:5px;color:var(--accent);font-weight:400;background:#f2ecfb}
    .stage{height:414px;border:1px solid #e5def0;border-radius:14px;background:#fbf8fe;box-shadow:0 4px 18px #68517e05;overflow:hidden;position:relative}.product-header{height:68px;display:flex;align-items:center;gap:34px;padding:0 30px;background:var(--header);border-bottom:1px solid #fff;position:relative;z-index:2}.brand{display:flex;gap:14px;align-items:center;width:136px;flex-shrink:0}.planet{height:32px;width:32px;position:relative;border-radius:50%;background:radial-gradient(circle at 30% 20%,#fff 2%,#eee5fc 26%,#b5a5db 82%);border:1px solid #ffffff;box-shadow:0 3px 8px #cabbdf4d}.planet::after{content:"";position:absolute;width:46px;height:15px;left:-8px;top:7px;border:1px solid #bba4df;border-radius:50%;transform:rotate(-34deg)}.wordmark{font-family:KaiTi,STKaiti,serif;font-size:28px;line-height:31px;letter-spacing:4px}.wordmark small{font-family:"Segoe UI",sans-serif;display:block;font-size:8px;line-height:12px;letter-spacing:4px;color:#8f7baf}
    .static-context{height:36px;border:1px solid var(--line);border-radius:20px;padding:0 13px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}.static-context strong{font-weight:400;color:var(--ink)}.scope-dot{width:7px;height:7px;background:#73a1b1;border-radius:50%;box-shadow:0 0 0 4px #e7f1f5}.plain-context{color:var(--muted);font-size:12px}.header-actions{margin-left:auto;display:flex;align-items:center;gap:12px}.language{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;color:var(--accent);font-size:16px;background:#f1ebfa}.account{display:flex;gap:10px;align-items:center;height:36px;font-size:14px}.avatar{width:32px;height:32px;border:1px solid #fff;border-radius:50%;background:#eae1f8;display:flex;align-items:center;justify-content:center;font-family:KaiTi,serif;font-size:23px;font-weight:700;color:#8566ba}.account>.anticon{font-size:10px;color:#9c8eae;margin-left:2px}
    .switcher{position:relative;flex-shrink:0}.switch-trigger{display:flex;align-items:center;gap:9px;height:34px;border:1px solid #d9caed;border-radius:9px;padding:0 11px;background:#f0e8fb;color:#7453b1;white-space:nowrap;font-size:13px}.switch-trigger>.anticon:first-child{font-size:15px}.switch-trigger>.anticon:last-child{font-size:10px}.switcher-A .switch-trigger{width:32px;height:32px;justify-content:center;padding:0;border-radius:8px;font-size:16px}.switcher-A .switch-trigger>.anticon{font-size:16px}.switcher-C .switch-trigger{border-radius:20px;height:36px;padding:0 14px;gap:10px}.scope{font-size:12px;color:#8875a2}.slash{color:#c5b7d9}.current-name{color:#634787}
    .popover{position:absolute;top:calc(100% + 12px);right:0;width:306px;padding:14px 11px 12px;border:1px solid #e7ddf3;background:white;border-radius:12px;box-shadow:0 12px 28px #4b33532b,0 2px 5px #4b335309;z-index:5}.popover::before{content:"";position:absolute;top:-6px;right:var(--arrow-position);width:11px;height:11px;background:#fff;border-left:1px solid #e7ddf3;border-top:1px solid #e7ddf3;transform:rotate(45deg);border-top-left-radius:2px}.switcher-C .popover{left:0;right:auto}.switcher-C .popover::before{left:var(--arrow-position);right:auto}.popover-heading{font-size:14px;font-weight:500;padding:0 4px 7px}.space-group>p{margin:7px 4px 6px;color:#a192b3;font-size:11px;line-height:17px}.space-group+.space-group{border-top:1px solid #f2edf8;margin-top:10px;padding-top:2px}.space-row{display:flex;align-items:center;gap:10px;padding:8px 10px;min-height:43px;width:100%;border-radius:8px;margin:2px 0;text-align:left;white-space:nowrap}.space-row.selected{background:var(--selected);color:#8060bc}.space-icon{width:28px;height:28px;border-radius:7px;background:#f5f1fc;display:flex;align-items:center;justify-content:center;color:#9b83bc;font-size:14px;flex-shrink:0}.selected .space-icon{background:#e7dcf7;color:#8060bc}.space-copy{display:flex;flex-direction:column;gap:4px}.space-name{font-size:13px;line-height:17px}.space-copy>small{font-size:10px;color:#a191b2;line-height:13px}.row-end{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:13px;color:#9877cc}.row-end small{font-size:10px;color:#a08bb9}
    .dashboard{height:346px;display:flex;background:linear-gradient(112deg,#f4edf9 0%,#ece8fb 65%,#eff4fc 100%);position:relative;z-index:0}.dashboard aside{width:208px;flex-shrink:0;background:#fbf8fc80;border-right:1px solid #e6dff2;padding:20px 12px;color:#9b8bad;font-size:12px}.dashboard aside>div{padding:11px 16px;margin-bottom:9px;border-radius:10px}.dashboard aside>.sidebar-current{background:#e9e0f7;color:#7e62b5}.page-content{padding:24px 30px;flex:1;color:#9a8bab;min-width:0}.page-content h3{font-size:24px;margin:0 0 12px;font-weight:600;color:#746184}.page-content>p{font-size:12px;margin:0 0 20px;color:#a395b4}.content-card{border:1px solid #ffffffb8;border-radius:12px;background:#ffffff91;overflow:hidden;width:100%}.data-row{display:grid;grid-template-columns:130px 1fr 130px 1fr;align-items:center;height:43px;padding:0 18px;font-size:12px}.data-row+.data-row{border-top:1px solid #eee8f5}.data-row strong{font-weight:400}.role-label{color:#80a5a9}.feature-card{margin-top:16px;border:1px solid #ffffffb8;border-radius:12px;background:#ffffff91;height:77px;padding:14px 18px;font-size:12px}.feature-card>strong{font-weight:500;color:#8c7a9e}.feature-card>div{margin-top:14px;color:#a590c0}.feature-card span{margin-left:28px}.board-footer{margin:22px 0 0;color:#a596b4;font-size:11px;text-align:right}
    @media(prefers-reduced-motion:reduce){*{animation:none;transition:none}}
  </style></head><body><main class="board"><div class="intro"><div><p class="eyebrow">万物 · 头部空间切换</p><h1>切换空间，三种入口</h1></div><p class="intro-note">点击入口 → 展开面板 → 选择空间</p></div>${proposals.map(proposal).join('')}<p class="board-footer">UI 候选预览 · 四个空间为示例</p></main></body></html>`
}

/** 导出本地可复现的 UI 图，验证面板边界、箭头定位与示例内容，不测试业务功能。 */
async function main() {
  const uiDir = resolve(featureDir, 'ui')
  await mkdir(uiDir, { recursive: true })
  const htmlPath = resolve(uiDir, 'workspace-switch-options.html')
  const pngPath = resolve(uiDir, 'workspace-switch-options.png')
  await writeFile(htmlPath, createPreview(), 'utf8')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 }, deviceScaleFactor: 1.5 })
    await page.goto(pathToFileURL(htmlPath).href)
    await page.evaluate(() => document.fonts.ready)
    await page.locator('.switcher').evaluateAll((elements) => {
      elements.forEach((element) => {
        element.style.setProperty('--arrow-position', `${element.querySelector('.switch-trigger').getBoundingClientRect().width / 2 - 5.5}px`)
      })
    })
    const evidence = await page.locator('.stage').evaluateAll((stages) => stages.map((stage) => {
      const rect = stage.getBoundingClientRect()
      const panel = stage.querySelector('.popover').getBoundingClientRect()
      const trigger = stage.querySelector('.switch-trigger').getBoundingClientRect()
      const element = stage.querySelector('.popover')
      const arrow = getComputedStyle(element, '::before')
      const arrowX = stage.querySelector('.switcher-C')
        ? panel.left + Number.parseFloat(arrow.left) + 5.5
        : panel.right - Number.parseFloat(arrow.right) - 5.5
      return {
        rows: stage.querySelectorAll('.space-row').length,
        selected: stage.querySelectorAll('.space-row.selected').length,
        searchInputs: stage.querySelectorAll('input').length,
        panelInsideStage: panel.left >= rect.left && panel.right <= rect.right && panel.top >= rect.top && panel.bottom <= rect.bottom,
        arrowOffset: Math.abs(arrowX - (trigger.left + trigger.width / 2)),
      }
    }))
    if (evidence.some((item) => item.rows !== 4 || item.selected !== 1 || item.searchInputs !== 0 || !item.panelInsideStage || item.arrowOffset > 1)) {
      throw new Error(`静态预览边界或示例内容不符合预期：${JSON.stringify(evidence)}`)
    }
    const dimensions = await page.locator('.board').boundingBox()
    await page.locator('.board').screenshot({ path: pngPath })
    const png = await stat(pngPath)
    if (!png.size) throw new Error('图片文件为空。')
    const report = { htmlPath, pngPath, bytes: png.size, width: Math.round(dimensions.width * 1.5), height: Math.round(dimensions.height * 1.5), evidence }
    await writeFile(resolve(dirname(fileURLToPath(import.meta.url)), 'preview-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}

await main()
