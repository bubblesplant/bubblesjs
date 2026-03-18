# Bee Portal

---

## 技术栈

| 类别     | 技术                                |
| -------- | ----------------------------------- |
| 框架     | Next.js 16 App Router（via vinext） |
| 运行时   | Node.js 24                          |
| 包管理   | pnpm                                |
| 语言     | TypeScript 5（严格模式）            |
| UI       | Ant Design 6                        |
| CSS      | UnoCSS（presetWind4 + Attributify） |
| 动画     | GSAP 3                              |
| 代码检查 | ESLint 10                           |

---

## 代码规范

```bash
# 仅检查
pnpm lint

# 检查并自动修复
pnpm lint:fix
```

### Git 提交规范

提交信息须遵循 [约定式提交（Conventional Commits）](https://www.conventionalcommits.org/) 格式：

```
type(scope): description
```

常用类型：`feat`、`fix`、`refactor`、`style`、`docs`、`chore`

示例：

```
feat(header): 添加导航链接
fix(layout): 修复移动端溢出问题
```

> pre-commit 钩子会自动对暂存文件执行 `lint:fix`，commit-msg 钩子通过 commitlint 校验提交信息格式。

---

## 分支与发布流程

### 开发环境（服务器：245）

1. 在自己的功能分支上开发
2. 将功能分支合并到**迭代主分支**
3. 将迭代主分支合并到 **`dev`** 分支
4. 推送后自动触发部署到开发环境

```
个人分支 → 迭代主分支 → dev（自动发布）
```

### 生产环境（服务器：214）

1. 在自己的功能分支上开发
2. 将功能分支合并到**迭代主分支**
3. 将迭代主分支合并到 **`release`** 分支
4. 对 `release` 分支打 tag 触发自动部署

```
个人分支 → 迭代主分支 → release → 打 tag（自动发布）
```

Tag 命名规范：`release@v<major>.<minor>.<patch>`

示例：

```bash
git tag release@v1.0.0
git push origin release@v1.0.0
```

---

## 项目结构

```
src/
  app/                    # Next.js App Router
    _components/          # 路由私有组件
    antd-provider.tsx     # Ant Design SSR 包装器
    layout.tsx            # 根布局
    page.tsx              # 首页
  assets/
    icon/                 # SVG 图标
    image/                # 位图资源
  styles/
    globals.css           # 全局样式 & 品牌 Token
```
