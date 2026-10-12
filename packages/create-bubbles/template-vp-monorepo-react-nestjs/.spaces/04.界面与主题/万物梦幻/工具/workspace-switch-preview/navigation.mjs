import { mkdir, writeFile, stat, readFile } from 'node:fs/promises'
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
const icons = webRequire('@ant-design/icons')
const samples = [
  { name: '万物平台', type: 'platform', company: '—', role: '平台管理员' },
  { name: '星屿科技', type: 'company', company: '星屿科技', role: '企业管理员', current: true },
  { name: '云川设计', type: 'company', company: '云川设计', role: '企业成员' },
  { name: '星屿官网', type: 'project', company: '星屿科技', role: '项目管理员' },
  { name: '运营后台', type: 'project', company: '星屿科技', role: '项目成员' },
  { name: '客户协作', type: 'project', company: '云川设计', role: '项目管理员' },
]

/** 使用真实产品的 Ant Design 图标，避免设计稿与现有图标风格不一致。 */
function icon(name) {
  return renderToStaticMarkup(createElement(icons[name], { 'aria-hidden': true }))
}

/** 沿用当前星球与楷体字标，让新导航入口保持产品品牌。 */
function brand() {
  return '<div class="brand"><span class="planet"></span><span class="wordmark">万物<small>WANWU</small></span></div>'
}

/** 语言和账户只作为设计参照，不接入用户会话或账号操作。 */
function actions() {
  return `<div class="actions"><button class="language" aria-label="切换语言">${icon('TranslationOutlined')}</button><span class="action-divider"></span><button class="account"><span class="avatar">林</span><span>林间</span>${icon('DownOutlined')}</button></div>`
}

/** 合并当前空间与切换动作，普通链接导航不带暗示展开面板的下拉箭头。 */
function navigation() {
  return `<a href="#workspace-page" class="workspace-nav" aria-label="切换空间，返回工作空间页"><span class="scope-icon">${icon('BankOutlined')}</span><span class="scope-label">企业空间</span><strong>星屿科技</strong><span class="nav-divider"></span><span class="swap">${icon('SwapOutlined')}</span><span class="nav-label">切换空间</span></a>`
}

/** 顶部场景展示共用管理页头与企业内容，底部场景展示完整选择页头。 */
function header(withNavigation) {
  return `<header class="product-header">${brand()}${withNavigation ? navigation() : '<span class="header-location">工作空间</span>'}${actions()}</header>`
}

/** 用半透明圆角卡片保留参考样式，项目同时显示所属企业，所有资料均为虚构。 */
function card(sample) {
  const names = { platform: '平台', company: '企业', project: '项目' }
  const descriptions = { platform: '平台管理工作空间', company: '企业协作工作空间' }
  const description = sample.type === 'project' ? `所属企业 · ${sample.company}` : descriptions[sample.type]
  return `<article class="workspace-card ${sample.type}${sample.current ? ' current-card' : ''}" aria-label="${sample.name}"><div class="card-meta"><span class="type-tag ${sample.type}">${names[sample.type]}</span><span class="role">${sample.role}</span><span class="current-slot">${sample.current ? `<span class="current-label">${icon('CheckOutlined')}当前空间</span>` : ''}</span></div><h3 title="${sample.name}">${sample.name}</h3><p class="card-description" title="${description}">${description}</p><button class="enter" aria-label="进入${sample.name}">进入空间${icon('ArrowRightOutlined')}</button></article>`
}

/** 完整选择页用检索、分类、企业过滤及分页支持大量空间，当前仅展示静态设计。 */
function workspacePage() {
  return `<div class="selection-stage" id="workspace-page">${header(false)}<div class="selection-content"><div class="selection-title"><div><h2>选择工作空间</h2><p>进入企业或项目，继续你的工作。</p></div><button class="return-current">${icon('ArrowLeftOutlined')}返回当前空间<span class="return-name">星屿科技</span></button></div><div class="directory"><div class="directory-tools"><label class="search">${icon('SearchOutlined')}<input placeholder="搜索空间名称或所属企业" readonly aria-label="搜索空间"/></label><button class="company-filter">${icon('FilterOutlined')}<span>全部企业</span>${icon('DownOutlined')}</button><button class="refresh">${icon('ReloadOutlined')}刷新工作空间</button></div><div class="tabs"><button class="tab selected">全部<span>68</span></button><button class="tab">平台<span>1</span></button><button class="tab">企业<span>7</span></button><button class="tab">项目<span>60</span></button><span class="visible-info">只显示你有权限访问的空间</span></div><section class="workspace-grid" aria-label="可访问的工作空间">${samples.map(card).join('')}</section><footer class="pagination"><span>共 <strong>68</strong> 个空间<span class="page-range">当前展示 1–6</span></span><div class="page-buttons"><button aria-label="上一页" disabled>${icon('LeftOutlined')}</button><button class="active" aria-current="page">1</button><button>2</button><button>3</button><span>···</span><button>12</button><button aria-label="下一页">${icon('RightOutlined')}</button><span class="page-size">6 个 / 页</span></div></footer></div></div></div>`
}

/** 生成独立图稿，所有交互仅为静态参照，不访问真实接口、不修改产品路由。 */
function html() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>万物 · 空间切换导航设计</title><style>
  :root{--ink:#39304f;--muted:#8c809e;--purple:#9274cb;--border:#e5dcf0;--cyan:#74a4b0}*{box-sizing:border-box}body{margin:0;background:#eeebf4;color:var(--ink);font-family:"Microsoft YaHei","Segoe UI",sans-serif;font-size:13px}button,input,a{font:inherit}button{cursor:pointer}button{color:inherit;background:transparent;border:1px solid transparent;box-shadow:0 2px 8px #9274cb00}a{color:inherit;text-decoration:none}button:focus-visible,a:focus-visible{outline:2px solid var(--purple);outline-offset:3px}button:hover,a:hover{border-color:#d4c6e9;background-color:#f3edf9;color:#7657b0}button,a{transition:color 150ms,background-color 150ms,border-color 150ms}svg{display:block;width:1em;height:1em}.anticon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
  .board{width:1440px;padding:38px 44px 28px;background:#f5f2fa}.intro{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:26px}.eyebrow{color:#9d8aac;font-size:11px;letter-spacing:2px;margin:0 0 10px}.intro h1{font-size:28px;line-height:1.4;margin:0;font-weight:600;letter-spacing:.5px}.intro-note{font-size:12px;color:#9b8fae;margin:0 0 5px}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}.section-heading h2{font-size:16px;font-weight:600;margin:0}.section-heading p{color:#9a8faa;font-size:12px;margin:0}.scope-note{color:#9e89b9;font-size:11px;font-weight:400;margin-left:16px}.top-stage,.selection-stage{border:1px solid #e1d7ec;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px #69507b05}.product-header{height:68px;padding:0 28px;display:flex;gap:24px;align-items:center;background:#fbf9fe;border-bottom:1px solid #ebe4f3}.brand{width:146px;display:flex;gap:15px;align-items:center;flex-shrink:0}.planet{height:31px;width:31px;border-radius:50%;position:relative;background:radial-gradient(circle at 25% 15%,#fff 2%,#ede5fc 25%,#b5a6d9 84%);border:1px solid white;box-shadow:0 3px 10px #c9b9df66}.planet:after{content:"";position:absolute;left:-8px;top:7px;width:46px;height:14px;border:1px solid #b8a0db;border-radius:50%;transform:rotate(-34deg)}.wordmark{font-family:KaiTi,STKaiti,serif;font-size:28px;line-height:30px;letter-spacing:4px}.wordmark small{font-family:"Segoe UI",sans-serif;display:block;color:#9c8bb4;font-size:8px;line-height:11px;letter-spacing:4px}
  .workspace-nav{height:38px;display:flex;align-items:center;gap:10px;padding:0 13px;border:1px solid #e3d8f1;border-radius:10px;background:#fff9;box-shadow:0 2px 8px #9274cb00;white-space:nowrap}.scope-icon{color:#79a4b0;font-size:15px}.scope-label{color:#8d7b9f;font-size:11px}.workspace-nav strong{font-size:13px;font-weight:500}.nav-divider{width:1px;height:17px;background:#e7ddf2;margin-left:5px;margin-right:3px}.swap{color:#9777c6;font-size:14px}.nav-label{color:#8b6ab7;font-size:12px}.actions{margin-left:auto;display:flex;align-items:center;gap:12px}.language{width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;color:#916bc3;background:#f1ebf9;border-radius:8px}.action-divider{width:1px;height:18px;background:#e7dff0;margin:0 2px}.account{height:36px;display:flex;align-items:center;gap:9px;font-size:13px;padding:0 2px;border-radius:8px}.avatar{width:32px;height:32px;background:#eae2f7;border-radius:50%;border:1px solid white;display:flex;align-items:center;justify-content:center;font-family:KaiTi,serif;font-size:22px;font-weight:600;color:#8b6bb8}.account>.anticon{font-size:10px;color:#ac9cba;margin-left:2px}.header-location{padding-left:24px;border-left:1px solid #e8e0f0;color:#9787a8;font-size:13px}
  .dashboard{height:200px;display:flex;background:linear-gradient(118deg,#f5ecf6,#ede9fa 65%,#edf5fb)}.sidebar{width:213px;background:#fcf9fd88;border-right:1px solid #e9e0f1;padding:16px 12px;flex-shrink:0}.sidebar>div{height:37px;border-radius:9px;margin-bottom:5px;display:flex;align-items:center;gap:9px;padding-left:16px;font-size:12px;color:#9b8bab}.sidebar .current{background:#eae0f7;color:#8564b7}.dashboard-content{padding:21px 28px;flex:1}.dashboard-content h3{margin:0 0 9px;font-size:23px;font-weight:600;color:#675678}.dashboard-content>p{color:#a191b0;font-size:12px;margin:0 0 19px}.overview{border:1px solid #ffffffb8;background:#ffffffab;border-radius:11px;display:grid;grid-template-columns:120px 1fr 120px 1fr;align-items:center;padding:0 18px;height:66px;color:#8d7c9e;font-size:12px}.overview strong{font-weight:400;color:#70617d}.overview .role-label{background:#e8f6f5;color:#6d9ca0;border-radius:4px;padding:3px 7px;width:fit-content}.flow{display:flex;align-items:center;justify-content:center;gap:12px;height:66px;color:#9c83b3;font-size:12px}.flow .anticon{font-size:16px;color:#b69ecc}.flow strong{font-weight:500;color:#8663b5}.flow-note{color:#ac9cbb;margin-left:10px}
  .selection-stage{background:radial-gradient(ellipse at 7% 0%,#f6e7f28a,transparent 45%),radial-gradient(ellipse at 65% 100%,#e5f3ffb0,transparent 65%),linear-gradient(116deg,#f4edf9,#efebfa 65%,#f0f5fc)}.selection-content{padding:38px 54px 36px}.selection-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;gap:16px}.selection-title h2{font-family:KaiTi,STKaiti,serif;font-size:34px;margin:0 0 12px;font-weight:400;letter-spacing:3px}.selection-title p{font-size:13px;color:#9182a4;margin:0}.return-current{display:flex;align-items:center;gap:8px;height:34px;border:1px solid #ddd1ec;background:#ffffff9c;border-radius:9px;padding:0 12px;font-size:12px;color:#8a6ba8}.return-name{color:#a397ae;border-left:1px solid #e7dff0;padding-left:10px;margin-left:3px}.directory{min-width:0}.directory-tools{display:flex;align-items:center;gap:12px;margin-bottom:18px}.search{height:38px;width:365px;max-width:100%;background:#ffffffbf;border:1px solid #e3d9ee;border-radius:10px;display:flex;align-items:center;gap:10px;padding:0 13px;color:#a394b4;box-shadow:0 2px 8px #9274cb00}.search>.anticon{font-size:15px}.search input{flex:1;min-width:0;outline:none;border:none;background:transparent;color:var(--ink);font-size:12px}.search input::placeholder{color:#a899b7}.search:focus-within{border-color:#b49ace}.company-filter,.refresh{height:38px;display:flex;gap:9px;align-items:center;border:1px solid #e3d9ee;border-radius:10px;padding:0 13px;color:#827096;font-size:12px;background:#ffffffb8;white-space:nowrap}.company-filter>.anticon:last-child{font-size:10px;margin-left:25px}.refresh{margin-left:auto;color:#7e6a94}.refresh>.anticon{font-size:14px}.tabs{display:flex;align-items:center;margin-bottom:24px;gap:9px;flex-wrap:wrap}.tab{display:flex;align-items:center;gap:8px;height:32px;border-radius:8px;font-size:12px;color:#9584a5;padding:0 13px}.tab span{font-size:10px;color:#ac98ba}.tab.selected{background:#ffffffb3;color:#8763ba;border-color:#e2d6ef}.tab.selected span{color:#9d80c3}.visible-info{margin-left:auto;font-size:11px;color:#a799b8}.workspace-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.workspace-card{height:216px;min-width:0;padding:27px 28px 22px;border:1px solid #ffffffed;border-radius:20px;background:radial-gradient(ellipse at 98% 0%,#e7f2fb90,transparent 44%),#ffffffba;box-shadow:0 14px 32px #647e9c09;transition:border-color 150ms,background-color 150ms}.workspace-card.platform{background:radial-gradient(ellipse at 98% 0%,#eee7fb8f,transparent 44%),#ffffffba}.workspace-card.project{background:radial-gradient(ellipse at 98% 0%,#f4e8f68f,transparent 44%),#ffffffba}.workspace-card.current-card{border-color:#d7c5ed;box-shadow:0 14px 32px #647e9c09}.workspace-card:hover{border-color:#cdbce5;background-color:#ffffffd9}.card-meta{display:flex;align-items:center;gap:8px;height:23px;margin-bottom:17px}.type-tag,.role{font-size:11px;border:1px solid transparent;border-radius:6px;padding:3px 7px;white-space:nowrap}.type-tag{background:#f3f2f6;color:#837590}.role{background:#f5edfd;color:#9a73bd}.current-slot{min-width:0;flex:1;display:flex;justify-content:flex-end}.current-label{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#9b7dbd;white-space:nowrap}.current-label>.anticon{font-size:9px}.workspace-card h3{font-size:20px;line-height:28px;font-weight:500;margin:0 0 13px;color:#514464;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.card-description{font-size:12px;line-height:20px;color:#9988ab;margin:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.enter{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-size:12px;height:29px;border-radius:7px;padding:0 2px;color:#9774c3;margin:21px 0 0}.enter>.anticon{font-size:12px}.pagination{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:28px;color:#a394b3;font-size:11px}.pagination strong{font-weight:500;color:#8e74a7;padding:0 3px}.page-range{margin-left:15px;color:#b0a2bd}.page-buttons{display:flex;align-items:center;gap:6px}.page-buttons button{height:29px;min-width:29px;display:flex;align-items:center;justify-content:center;border-radius:7px;font-size:11px;color:#9e89b3}.page-buttons .active{background:#ffffffbd;border-color:#ded0ee;color:#8a63b4}.page-buttons>span{padding:0 4px}.page-buttons .page-size{border-left:1px solid #ddd2e8;margin-left:10px;padding-left:16px;color:#9c88af;white-space:nowrap}.page-buttons button:disabled{color:#c5b9d2;background:transparent;border-color:transparent;cursor:default}.board-footer{text-align:right;font-size:10px;color:#b6a5c3;letter-spacing:.5px;margin:18px 0 0}
  @media(max-width:1100px){.board{width:100%;padding:28px}.intro{gap:18px}.product-header{gap:16px;padding:0 20px}.brand{width:120px}.selection-content{padding:32px}.workspace-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.current-label{font-size:10px}.sidebar{width:180px}.overview{grid-template-columns:80px 1fr 80px 1fr}.flow-note{display:none}.intro-note{max-width:150px}.pagination{flex-wrap:wrap}}
  @media(max-width:680px){.board{padding:18px 12px}.intro{display:block}.intro h1{font-size:23px}.intro-note{margin-top:12px;max-width:none}.section-heading p,.scope-note,.scope-label,.nav-divider,.nav-label,.action-divider,.account>span:not(.avatar),.header-location{display:none}.brand{width:64px;gap:8px}.planet{width:22px;height:22px}.planet:after{width:31px;left:-5px;height:10px;top:6px}.wordmark{font-size:19px;letter-spacing:1px;line-height:22px}.wordmark small{font-size:6px;letter-spacing:1px;line-height:7px}.product-header{padding:0 12px;gap:10px;height:60px}.workspace-nav{padding:0 8px;gap:6px;min-width:0}.workspace-nav strong{max-width:70px;overflow:hidden;text-overflow:ellipsis;font-size:11px}.actions{gap:6px}.language{width:28px;height:28px}.account{gap:4px}.avatar{height:28px;width:28px;font-size:19px}.account>.anticon{margin:0;font-size:8px}.selection-content{padding:26px 20px}.selection-title{display:block;margin-bottom:24px}.selection-title h2{font-size:29px;letter-spacing:2px}.return-current{margin-top:18px}.directory-tools{flex-wrap:wrap;gap:10px}.search{width:100%}.company-filter{flex:1;justify-content:space-between}.company-filter>.anticon:last-child{margin:0}.refresh{margin-left:0}.tabs{gap:4px;margin-bottom:20px}.tab{padding:0 8px}.visible-info{display:none}.workspace-grid{grid-template-columns:minmax(0,1fr);gap:18px}.workspace-card{padding:25px 24px;height:212px}.sidebar{display:none}.dashboard-content{padding:20px}.dashboard-content h3{font-size:20px}.overview{display:flex;flex-wrap:wrap;gap:12px;height:auto;min-height:66px;padding:15px}.flow{gap:7px;font-size:10px}.flow>.anticon{font-size:12px}.pagination{gap:14px}.page-range{margin-left:9px}.page-buttons{gap:3px;flex-wrap:wrap}.page-buttons .page-size{padding-left:10px;margin-left:4px}.board-footer{line-height:1.7}}
  @media(prefers-reduced-motion:reduce){button,a{transition:none}}
  </style></head><body><main class="board"><div class="intro"><div><p class="eyebrow">万物 · 空间导航</p><h1>从当前空间，回到完整选择页</h1></div><p class="intro-note">空间入口 + 多空间页面 · UI 设计预览</p></div><div class="section-heading"><h2>空间入口<span class="scope-note">企业 / 项目 / 平台共用</span></h2><p>当前空间与切换动作合并在左侧</p></div><div class="top-stage">${header(true)}<div class="dashboard"><aside class="sidebar"><div class="current">${icon('HomeOutlined')}企业工作台</div><div>${icon('IdcardOutlined')}企业资料</div><div>${icon('TeamOutlined')}企业成员</div><div>${icon('FolderOutlined')}项目管理</div></aside><section class="dashboard-content"><h3>企业工作台</h3><p>查看当前身份，选择你需要的管理功能。</p><div class="overview"><span>当前用户</span><strong>林间</strong><span>当前身份</span><span class="role-label">企业管理员</span></div></section></div></div><div class="flow"><strong>点击左侧「切换空间」</strong>${icon('ArrowDownOutlined')}<span>返回工作空间页</span><span class="flow-note">空间多时，在完整页面中查找与选择</span></div><div class="section-heading"><h2>工作空间页<span class="scope-note">多空间场景</span></h2><p>搜索 · 类型分类 · 企业筛选 · 分页</p></div>${workspacePage()}<p class="board-footer">UI 设计预览 · 68 个空间及页面数据均为虚构示例 · 功能尚未实施</p></main></body></html>`
}

/** 渲染并验证本地设计图的文件、PNG 元数据、内容和边界，结果仅证明静态图稿。 */
async function main() {
  const uiDir = resolve(featureDir, 'ui')
  const evidenceDir = resolve(featureDir, '测试证据')
  await mkdir(uiDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  const htmlPath = resolve(uiDir, 'workspace-switch-navigation.html')
  const pngPath = resolve(uiDir, 'workspace-switch-navigation.png')
  await writeFile(htmlPath, html(), 'utf8')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1.5 })
    await page.goto(pathToFileURL(htmlPath).href)
    await page.evaluate(() => document.fonts.ready)
    const checks = await page.evaluate(() => {
      const board = document.querySelector('.board').getBoundingClientRect()
      const containers = [...document.querySelectorAll('.product-header,.directory,.selection-stage,.top-stage,.workspace-card')]
      return {
        navigationTriggers: document.querySelectorAll('.workspace-nav').length,
        workspacePopovers: document.querySelectorAll('.popover').length,
        displayedCards: document.querySelectorAll('.workspace-card').length,
        currentCards: document.querySelectorAll('.current-card').length,
        currentWorkspace: document.querySelector('.current-card h3')?.textContent,
        tables: document.querySelectorAll('table').length,
        cardColumns: getComputedStyle(document.querySelector('.workspace-grid')).gridTemplateColumns.split(' ').length,
        singleEntryPerCard: [...document.querySelectorAll('.workspace-card')].every((element) => element.querySelectorAll('.enter').length === 1),
        projectsWithCompany: [...document.querySelectorAll('.workspace-card.project')].every((element) => element.querySelector('.card-description').textContent.startsWith('所属企业 · ')),
        lastPage: Number([...document.querySelectorAll('.page-buttons button')].at(-2).textContent),
        pageSize: document.querySelector('.page-size').textContent,
        searchInputs: document.querySelectorAll('.search input').length,
        typeTabs: document.querySelectorAll('.tab').length,
        enterpriseFilter: Boolean(document.querySelector('.company-filter')),
        pagination: Boolean(document.querySelector('.pagination')),
        refreshButton: Boolean(document.querySelector('.refresh')),
        insideBoard: containers.every((element) => {
          const box = element.getBoundingClientRect()
          return box.left >= board.left && box.right <= board.right && box.bottom <= board.bottom
        }),
        horizontallyContained: containers.every((element) => element.scrollWidth <= element.clientWidth + 1),
      }
    })
    if (checks.navigationTriggers !== 1 || checks.workspacePopovers !== 0 || checks.displayedCards !== 6 || checks.currentCards !== 1 || checks.currentWorkspace !== '星屿科技' || checks.tables !== 0 || checks.cardColumns !== 3 || !checks.singleEntryPerCard || !checks.projectsWithCompany || checks.lastPage !== Math.ceil(68 / 6) || checks.pageSize !== '6 个 / 页' || checks.searchInputs !== 1 || checks.typeTabs !== 4 || !checks.enterpriseFilter || !checks.pagination || !checks.refreshButton || !checks.insideBoard || !checks.horizontallyContained) throw new Error(`图稿检查失败：${JSON.stringify(checks)}`)
    await page.locator('.board').screenshot({ path: pngPath })
    const file = await stat(pngPath)
    const png = await readFile(pngPath)
    if (!file.size || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 为空或签名无效。')
    const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
    const image = await page.evaluate(async (url) => {
      const picture = new Image()
      picture.src = url
      await picture.decode()
      return { width: picture.naturalWidth, height: picture.naturalHeight }
    }, pathToFileURL(pngPath).href)
    if (image.width !== dimensions.width || image.height !== dimensions.height) throw new Error('图像解码尺寸不一致。')
    const evidence = { previewOnly: true, renderer: 'local HTML/CSS + Edge headless', htmlPath, pngPath, bytes: file.size, ...dimensions, decoded: true, checks }
    await writeFile(resolve(evidenceDir, 'workspace-switch-navigation.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(evidence, null, 2))
  } finally {
    await browser.close()
  }
}

await main()
