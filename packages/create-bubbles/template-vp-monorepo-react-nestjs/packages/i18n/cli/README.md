# @bubblesjs/i18n-cli

扫描源码中的静态 `tr()` 调用，并把缺失 key 同步到配置的 JSON 语言包。

这个 CLI 只负责提取和维护语言包，不生成 `generated.ts`，也不与应用运行时的语言列表、语言切换或 TypeScript 类型提示联动。

## 配置

在项目根目录创建 `i18n.config.ts`：

```ts
import { defineConfig } from '@bubblesjs/i18n-cli'

export default defineConfig({
  callNames: ['tr'],
  projects: {
    web: {
      include: ['apps/web/src/**/*.{js,jsx,ts,tsx}'],
      catalogs: {
        zh_CN: 'apps/web/src/locales/zh_CN.json',
        en_US: 'apps/web/src/locales/en_US.json',
      },
    },
  },
  report: '.bubbles-i18n/report.json',
})
```

所有相对路径都以配置文件所在目录为基准。CLI 会从当前目录向上查找 `i18n.config.ts`，也支持通过 `--config` 指定其他配置文件。

不同应用应配置为不同 project；每个 project 只同步自己的源码与语言包。

## 扫描规则

会识别静态字符串：

```ts
tr('保存')
tr('保存')
tr(`保存`)
tr('保存')
tr('你好 {name}', { name })
```

不会识别动态表达式：

```ts
tr(key)
tr(getKey())
tr('prefix-' + value)
tr(`你好 ${name}`)
```

扫描器故意不依赖 AST，按文本识别静态调用，因此不区分具体编程语言。对应的取舍是：注释或普通字符串中出现完整的 `tr('key')` 文本时，也会被识别。

## 命令

```bash
# 添加缺失 key；已有翻译保持不变
vp run i18n:sync

# 只检查，不修改语言包；存在缺失 key 时退出码为 1
vp run i18n:check

# 预览同步
bubbles-i18n sync --dry-run

# 只处理指定 project
bubbles-i18n sync --project web

# 删除源码中已不存在的 key
bubbles-i18n sync --clean

# 源文件存在但扫描结果为空时，明确允许清空非空语言包
bubbles-i18n sync --clean --allow-empty

# 检查时也把废弃 key 视为失败
bubbles-i18n check --fail-on-stale
```

`--clean` 默认不会运行在“include 一个源文件都没匹配到”的 project 上。即使传入 `--allow-empty`，也不能绕过这项保护。

## 同步与报告

- 缺失 key 写为 `"key": "key"`。
- 已有 key 和翻译原样保留。
- 默认只把废弃 key 放入 `unused`，不会删除。
- `--clean` 时，实际删除的 key 放入 `deleted`。
- JSON 会先统一校验，再开始写入；写入使用临时文件和原子替换。
- 报告路径不能覆盖配置文件、语言包、源码或已有的非 CLI 报告文件。

报告按语言包文件平铺：

```json
{
  "command": "sync",
  "clean": false,
  "dryRun": false,
  "files": [
    {
      "project": "web",
      "path": "apps/web/src/locales/en_US.json",
      "locale": "en_US",
      "added": ["English", "中文"],
      "unused": ["旧文案"],
      "deleted": [],
      "unchangedCount": 2
    }
  ]
}
```

这里的一项代表一个实际 JSON 文件：该文件新增了哪些 key、有哪些废弃 key、删除了哪些 key，以及有多少 key 已存在且仍在使用。
