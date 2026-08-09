# JSON 与 Excel 双向同步规划

> 状态：设计稿，尚未实施。
>
> 目标：在现有“代码扫描 → JSON”之外，增加“JSON → Excel”和“Excel → JSON”，并让两类功能的命令、配置、报告和删除参数彼此隔离。

## 1. 总体结论

保留现有命令不变：

```text
bubbles-i18n sync   代码 → JSON
bubbles-i18n check  检查代码与 JSON
```

新增独立的 Excel 命名空间：

```text
bubbles-i18n excel export  JSON → Excel
bubbles-i18n excel import  Excel → JSON
```

不建议增加 `excel sync`，因为它不能明确说明本次操作以哪一边为输入、会修改哪一边。

配置上新增顶层 `excel`，现有 `callNames`、`include`、`exclude` 等扫描参数不会进入 Excel 流程。`excel.projects.<name>` 自动引用同名的 `projects.<name>.catalogs`，避免重复维护 locale 和 JSON 文件路径。

```text
代码扫描参数 ── sync/check ──→ JSON catalogs
                                     ↑
Excel 参数 ── excel import/export ───┘
```

两套功能唯一共享的是 `projects.<name>.catalogs`，因为它是 locale 与 JSON 文件路径的事实来源。

第一版明确采用“一项目一文件”：一个 project 对应一个 `.xlsx` 文件和一个由 CLI 管理的可见翻译 sheet，另有一个可选的隐藏 metadata sheet。用户自建的其他 sheet 不参与同步；不同 project 不共用 Excel 文件。

## 2. Excel 表格结构

可见数据 sheet 第一行为表头，纵向每一行是 key，横向每一列是语言：

| key  | 中文 | English | 备注     |
| ---- | ---- | ------- | -------- |
| 登录 | 登录 | Sign in | 登录按钮 |
| 保存 | 保存 | Save    |          |

规则：

- 第一列是 key。
- 每个 locale 对应一个语言列。
- 一个 Excel 文件只属于一个 project。
- 每个文件只有一个由 CLI 管理的可见翻译 sheet；CLI 可以另外创建一个隐藏 metadata sheet。
- 用户自行增加的其他 sheet 不参与同步，导出时尽量原样保留，但不允许再映射到其他 project。
- 不同 project 配置的 Excel 路径解析后必须唯一，不能指向同一个文件。
- 导入按照表头名称匹配语言，不依赖语言列所在位置。
- 行顺序不影响导入。
- key 使用精确字符串匹配，不自动 trim，也不做 Unicode 标准化。
- 翻译值的换行、首尾空格、中文、emoji 和占位符原样保留。
- 完全空白的行忽略。
- key 为空但语言列存在内容时直接报错。
- 重复 key 直接报错，并给出重复行号。
- 缺少配置中的语言列直接报错。
- 未声明的额外列直接报错；声明为 `extraColumns` 的备注类列忽略并尽量保留。

第一版只支持 `.xlsx`：

- 不支持 `.xls`。
- 不支持 `.xlsm`。
- 不保证保留宏、透视表、图表等高级 Excel 特性。

## 3. 推荐配置结构

```ts
import { defineConfig } from '@bubblesjs/i18n-cli'

export default defineConfig({
  // 现有：代码扫描 → JSON
  callNames: ['tr'],
  projects: {
    webVue: {
      include: ['apps/web-vue/src/**/*.{js,ts,vue}'],
      catalogs: {
        zh_CN: 'apps/web-vue/src/locales/zh_CN.json',
        en_US: 'apps/web-vue/src/locales/en_US.json',
      },
    },
  },
  report: '.bubbles-i18n/report.json',

  // 新增：JSON ↔ Excel
  excel: {
    report: '.bubbles-i18n/excel-report.json',

    projects: {
      // 这里的 webVue 自动引用上面的 projects.webVue.catalogs，
      // 不再重复配置 project 名称或 JSON 路径。
      webVue: {
        file: 'translations/web-vue.xlsx',
        sheet: 'translations',
        keyHeader: 'key',

        // 数组顺序就是 Excel 中的语言列顺序。
        // 不配置时使用 projects.webVue.catalogs 的顺序，
        // 表头直接使用 zh_CN、en_US 等 locale ID。
        locales: [
          { locale: 'zh_CN', header: '中文' },
          { locale: 'en_US', header: 'English' },
        ],

        // 用户可以维护这些列；导入时不写入 JSON。
        extraColumns: ['备注'],

        export: {
          // merge：更新 CLI 管理的 key/locale 单元格，
          // 保留额外列、已有行顺序和允许保留的格式。
          mode: 'merge',

          // catalog：按 catalogs 声明顺序遍历 JSON，
          // key 第一次出现时加入，不引入 sourceLocale。
          keyOrder: 'catalog',
        },

        import: {
          // preserve：空单元格不覆盖 JSON。
          emptyCell: 'preserve',
        },

        tracking: {
          // 推荐开启隐藏 metadata sheet，用于检测
          // JSON、Excel 是否同时修改。
          enabled: true,
        },
      },
    },

    backup: {
      enabled: true,
      directory: '.bubbles-i18n/backups',
      keep: 10,
    },

    limits: {
      maxFileSizeMB: 20,
      maxRows: 50_000,
    },
  },
})
```

### 3.1 隔离原则

| 配置                  | 使用方            | Excel 命令是否读取 |
| --------------------- | ----------------- | ------------------ |
| `callNames`           | 代码扫描          | 否                 |
| `projects.*.include`  | 代码扫描          | 否                 |
| `projects.*.exclude`  | 代码扫描          | 否                 |
| `projects.*.catalogs` | JSON 文件映射     | 是，只读取这一项   |
| `report`              | 代码扫描报告      | 否                 |
| `excel.report`        | Excel 报告        | 是                 |
| `excel.projects`      | 项目的 Excel 配置 | 是                 |
| `excel.backup`        | Excel 操作备份    | 是                 |

Excel 下不再复制一份 JSON 路径，否则两处配置可能不一致。

### 3.2 第一版范围

- `excel.projects` 的 key 必须存在于根配置的 `projects` 中。
- 一个 project 最多配置一个 Excel 文件。
- 一个 Excel 文件只属于一个 project。
- 每个文件只有一个由 CLI 管理的可见翻译 sheet；隐藏 metadata sheet 和用户自建的非托管 sheet 都不算翻译数据 sheet。
- 不同 project 的 `file` 解析后不能指向同一路径，Windows 下按不区分大小写处理。
- 根配置中的 project 可以不配置 Excel；此时仍可使用现有 `sync/check`，但不能执行 Excel 命令。
- `sheet` 需满足 Excel 的 31 字符限制和非法字符规则，也不能与保留的 metadata sheet 名冲突。

## 4. package.json 脚本

建议新增：

```json
{
  "scripts": {
    "i18n:excel:export": "bubbles-i18n excel export",
    "i18n:excel:import": "bubbles-i18n excel import"
  }
}
```

从根目录运行：

```powershell
# JSON → Excel，先预览
vp run i18n:excel:export --project webVue --dry-run

# JSON → Excel，真实写入
vp run i18n:excel:export --project webVue

# Excel → JSON，先预览
vp run i18n:excel:import --project webVue --dry-run

# Excel → JSON，真实写入
vp run i18n:excel:import --project webVue
```

`--project` 可以多次传入。不传时默认处理 `excel.projects` 中配置的全部项目，但每个项目仍然读写自己的 Excel 文件。

## 5. 命令行参数规划

### 5.1 通用参数

| 参数                | 默认值         | 说明                                        |
| ------------------- | -------------- | ------------------------------------------- |
| `--config <path>`   | 自动向上查找   | 指定 `i18n.config.*`                        |
| `--project <name>`  | 全部           | 选择 Excel project；可以多次传入            |
| `--locale <locale>` | project 中全部 | 只处理指定语言；可以多次传入                |
| `--dry-run`         | `false`        | 只计算差异和报告，不写 Excel、JSON 或备份   |
| `--report <path>`   | `excel.report` | 临时覆盖本次 Excel 报告路径                 |
| `--no-backup`       | `false`        | 明确关闭本次备份                            |
| `--allow-untracked` | `false`        | 允许处理没有 CLI metadata 的手工 Excel 文件 |

`--report`、`--no-backup` 和 `--allow-untracked` 只属于 `excel` 子命令，不影响现有 `sync/check`。

### 5.2 JSON → Excel：`excel export`

```text
bubbles-i18n excel export [通用参数]
```

额外参数：

| 参数                  | 默认值  | 说明                                                |
| --------------------- | ------- | --------------------------------------------------- |
| `--prune`             | `false` | 删除 Excel 中存在、JSON key 并集中不存在的行        |
| `--allow-empty`       | `false` | 只有和 `--prune` 一起使用时，允许空 JSON 清空数据行 |
| `--conflict <policy>` | `error` | 双方同时修改时的处理策略                            |

导出默认使用 `merge`：

- JSON 中的新 key 添加为新行。
- JSON 中变化的翻译更新对应语言单元格。
- Excel 的额外列、已有行顺序和允许保留的格式尽量保留。
- Excel 独有行默认保留并写入报告。
- 只有 `--prune` 才删除 Excel 独有行。

配置路径下已经存在同名 Excel 是正常情况，不会直接重建整本文件。CLI 先读取现有文件，再按下面规则合并：

| 当前情况                          | export 默认处理                                     |
| --------------------------------- | --------------------------------------------------- |
| JSON 有新 key，Excel 没有         | 在可见翻译 sheet 中追加一行                         |
| JSON 没有该 key，Excel 有         | 保留 Excel 行并报告；只有 `--prune` 才删除          |
| 只有 JSON 相对 metadata 发生变化  | 把 JSON 值安全更新到 Excel                          |
| 只有 Excel 相对 metadata 发生变化 | 保留 Excel 值并报告“等待 import”                    |
| 双方改成相同值                    | 视为已经一致并更新 metadata                         |
| 双方都修改且值不同                | 视为冲突，默认不写任何选中项目                      |
| 现有 Excel 没有 metadata          | 默认拒绝接管；显式 `--allow-untracked` 后按方向处理 |

覆盖同名 Excel 前创建备份，并通过临时文件验证后替换；文件被 Excel 占用时在任何正式写入前停止。

为避免无意删除全部项目，`--prune` 必须至少显式传入一个 `--project`。需要清理多个项目时可以重复传入 `--project`，但不能依赖“不传项目即全部”的默认选择。

### 5.3 Excel → JSON：`excel import`

```text
bubbles-i18n excel import [通用参数]
```

额外参数：

| 参数                  | 默认值     | 说明                                                  |
| --------------------- | ---------- | ----------------------------------------------------- |
| `--blank <policy>`    | `preserve` | 空翻译单元格的处理方式                                |
| `--prune`             | `false`    | 删除 Excel 中整行不存在的 JSON key                    |
| `--allow-empty`       | `false`    | 只有和 `--prune` 一起使用时，允许空翻译表清空 catalog |
| `--conflict <policy>` | `error`    | 双方同时修改时的处理策略                              |

`--blank` 可选值：

| 值         | 行为                                    |
| ---------- | --------------------------------------- |
| `preserve` | 默认；空单元格不修改 JSON，也不新增空值 |
| `empty`    | 把空单元格写为 JSON 空字符串 `""`       |
| `delete`   | 删除该 locale 下对应的单个 key          |

`--prune` 与 `--blank delete` 是两种不同删除：

- `--prune`：Excel 中整行不存在，删除整个 key。
- `--blank delete`：行存在，但某个语言单元格为空，只删除该 locale 的 key。

它们不能混为同一种语义。

import 的 `--prune` 同样要求至少显式传入一个 `--project`。

### 5.4 冲突参数

为保持命令方向明确，推荐按命令限制可选值：

```text
excel export --conflict error|use-json
excel import --conflict error|use-excel
```

| 命令     | 值          | 行为                                           |
| -------- | ----------- | ---------------------------------------------- |
| 两者     | `error`     | 默认；发现双方同时修改且值不同，所有文件都不写 |
| `export` | `use-json`  | 使用当前 JSON 值覆盖 Excel 冲突单元格          |
| `import` | `use-excel` | 使用当前 Excel 值覆盖 JSON 冲突项              |

如果 export 时决定保留 Excel，应改为执行 import；如果 import 时决定保留 JSON，应改为执行 export。这样不会让 export 反向修改 JSON，也不会让 import 反向修改可见 Excel 数据。

冲突策略只处理真正的“双边修改冲突”，不改变 `--prune` 和 `--blank` 的删除规则。一次选择多个 project 时，策略会应用于所有选中项目，因此默认 `error` 最安全。

## 6. JSON → Excel 规则

### 6.1 key 集合

导出使用配置中所有 locale JSON key 的并集，不引入 `sourceLocale`：

- key 只存在于 `zh_CN.json` 时仍然导出。
- 对应 `en_US` 单元格为空。
- 报告记录该 locale 缺少这个 key。

默认行顺序：

1. 按 `excel.projects.<project>.locales` 的配置顺序遍历 catalogs。
2. 保留各 JSON 中原有 key 顺序。
3. key 第一次出现时加入并集。

这只是展示顺序，不代表某种语言是 source locale。

### 6.2 Excel 独有数据

默认不删除：

- Excel 独有行记入 `targetOnlyKeys`。
- 额外列保持不变。
- 只有显式 `--prune` 才删除独有行。

### 6.3 公式安全

导出时所有 key 和翻译都写为文本 cell：

- `=SUM(...)` 仍是普通翻译文本，不生成公式。
- `+`、`-`、`@` 开头的内容也按文本写入。
- 超过 Excel 单元格 32,767 字符限制时直接报错。

## 7. Excel → JSON 规则

### 7.1 类型校验

key 和语言列只接受：

- 字符串 cell。
- 空 cell。

以下类型默认报错，不静默转字符串：

- 数字。
- 布尔值。
- 日期。
- 公式。
- hyperlink。
- rich text。

例如 Excel 把 `001` 自动转为数字 `1` 后，CLI 已无法还原原值，因此必须报错。

### 7.2 新增与更新

- Excel 非空值覆盖或新增对应 JSON 翻译。
- 新行只有部分语言有值时，只更新有值的 locale。
- 空单元格默认 `preserve`，不会清空已有翻译。
- JSON 中存在、Excel 中整行不存在的 key 默认保留并报告。
- 只有 `--prune` 才删除整行缺失的 key。

### 7.3 空字符串边界

Excel 在界面上无法可靠区分：

1. JSON 中没有这个 key。
2. JSON 中存在 `"key": ""`。
3. 用户暂时留空，不希望覆盖原值。

因此推荐默认：

```text
--blank preserve
```

这能保证把 Excel 导回原有 JSON 时不会因为译员留空而破坏已有翻译。

但如果只保留 Excel、删除全部 JSON，再依赖 Excel 完整重建 JSON，则“missing”和“空字符串”无法仅凭可见单元格区分。要实现完全无损重建，需要启用隐藏 metadata。

## 8. 隐藏 metadata 与真正的双向冲突检测

这是实施范围中最需要确认的一项。

### 8.1 为什么需要 metadata

典型场景：

1. 从 JSON 导出 Excel。
2. 开发人员修改 JSON。
3. 翻译人员同时修改 Excel。
4. 再次导入或导出。

如果没有同步基线，CLI 只能看到“两边当前值不同”，无法判断哪一边发生过修改，容易覆盖另一边的工作。

### 8.2 推荐 metadata 内容

CLI 在每个 project 的 Excel 文件内增加隐藏 sheet，例如 `__bubbles_i18n__`。它和可见翻译 sheet 位于同一个 `.xlsx` 中，不生成容易与 Excel 文件失去对应关系的旁路 metadata 文件。

metadata 记录：

- schema 版本。
- CLI 版本。
- project ID、文件 ID、revision 和最后更新时间。
- 可见翻译 sheet 的实际名称。
- locale 与表头映射指纹。
- 配置指纹；只包含相对配置目录的 catalog 路径、locale 集合、表头映射和 sheet 名，不包含机器绝对路径或备份设置。
- 每个 `key × locale` 在上次同步时是 missing、empty 还是 value。
- 上次同步值的 hash，不记录完整翻译正文。

metadata 使用 `key + locale` 定位数据，不依赖 Excel 行号，因此用户调整行顺序不会破坏基线。

### 8.3 metadata 更新时机

- 第一次 export 成功写入并重新读取 Excel 后创建 metadata。
- export 成功时，只更新已经安全同步到 Excel 的单元格基线。
- import 成功写入 JSON 后，更新同一个 Excel 文件内的隐藏 metadata；因此 import 会修改 Excel 的内部 metadata，即使可见翻译 sheet 没有变化。
- 只有 JSON 与 Excel 最终相同的单元格才能更新基线。
- 只处理部分 `--locale` 时，只更新本次处理的 locale。
- `--dry-run`、校验失败、写入失败、回滚或 `--conflict error` 时完全不更新。
- Excel 单边修改但尚未 import、JSON 单边修改但尚未 export 的单元格继续保留旧基线。

metadata 保存的是“最后一次双方确认一致的状态”，不是每次命令的历史日志。每次操作的历史由报告和备份承担。

### 8.4 三方比较

| 与基线比较            | 处理                                    |
| --------------------- | --------------------------------------- |
| JSON 未变、Excel 已变 | 只有 Excel 修改；import 可安全写入 JSON |
| JSON 已变、Excel 未变 | 只有 JSON 修改；export 可安全写入 Excel |
| 双方都修改成相同值    | 无冲突，接受最终值并更新 metadata       |
| 双方都修改且值不同    | 真正冲突；默认所有选中项目都不写        |

“key 不存在”和“值为空字符串”都必须作为独立状态参与比较。双方修改成不同值时，只有方向匹配的 `use-json` 或 `use-excel` 才会解决冲突；两边一致后才能更新该单元格 metadata。

### 8.5 没有 metadata 的 Excel 文件

推荐默认拒绝导入已有数据的未跟踪 Excel 文件，并提示先执行 export。

如果用户明确传入：

```text
--allow-untracked
```

则允许按操作方向处理：

- export：JSON 视为来源。
- import：Excel 视为来源。
- 报告必须标记 `untracked: true`，说明无法检测历史双边冲突。
- 首次安全接管成功后，在该项目的 Excel 文件中创建 metadata。

### 8.6 两种实施范围

#### 方案 A：简单导入/导出

- 不保存同步基线。
- 操作方向决定来源。
- 实现较快。
- 无法判断 JSON、Excel 是否同时修改。
- 适合明确规定“同一时间只有一边允许编辑”的团队。

#### 方案 B：安全双向同步，推荐

- 隐藏 metadata 保存 hash 基线。
- 自动识别单边修改和双边冲突。
- 支持 missing 与 empty 的精确状态。
- 实现和测试工作量更大，但不容易静默覆盖翻译。

## 9. 原子写入、备份和并发修改

### 9.1 写入前

1. 读取并验证全部选中 project 的 JSON catalogs、Excel 文件、可见翻译 sheet 和表头。
2. 在内存生成完整变更计划。
3. 记录输入文件 hash。
4. 所有选中 project 都通过校验后才能开始写入；任何一个项目失败时不写任何文件。

### 9.2 写入时

1. 所有目标先写入同目录临时文件。
2. 重新读取临时 JSON/XLSX，确认可以解析。
3. 写入前再次检查原文件 hash，防止执行期间被其他程序修改。
4. 创建备份。
5. 使用原子替换提交。
6. 失败时从备份回滚。

文件系统无法提供多个文件的真正事务，因此需要事务清单和备份完成可回滚的“尽力事务”。失败报告必须区分已经提交、成功回滚和回滚失败的项目。

### 9.3 默认建议

- 有实际变化才创建备份。
- `--dry-run` 不创建临时文件和备份。
- 默认开启备份，`--no-backup` 才关闭。
- 备份按 `runId/project` 隔离，避免一个活跃项目挤掉其他项目的历史。
- export 覆盖已有 Excel 时备份该 `.xlsx`；import 修改 JSON 并刷新 metadata 时同时备份 JSON 和 `.xlsx`。
- Excel 文件被 Microsoft Excel 占用时立即停止，不允许只更新一部分 JSON。
- 备份目录加入 `.gitignore`。

## 10. 报告规划

Excel 报告使用独立文件：

```text
.bubbles-i18n/excel-report.json
```

示例：

```json
{
  "version": 1,
  "operation": "excel-import",
  "dryRun": true,
  "prune": false,
  "projects": [
    {
      "project": "webVue",
      "file": "translations/web-vue.xlsx",
      "sheet": "translations",
      "untracked": false,
      "transactionStatus": "dry-run",
      "locales": {
        "en_US": {
          "added": ["注册"],
          "updated": ["登录"],
          "targetOnly": ["已经废弃"],
          "deleted": [],
          "emptySkipped": ["忘记密码"],
          "unchangedCount": 20
        }
      },
      "conflicts": [
        {
          "locale": "en_US",
          "key": "登录",
          "cell": "C12",
          "reason": "both-changed"
        }
      ],
      "warnings": []
    }
  ]
}
```

默认报告不复制完整翻译正文，只记录 key、locale、cell 和变更类型，避免报告体积过大或泄露更多业务文本。

## 11. 实现模块隔离

建议新增独立目录：

```text
src/excel/
  config.ts
  workbook.ts
  metadata.ts
  export.ts
  import.ts
  transaction.ts
  report.ts
```

现有模块保持职责不变：

```text
scanner.ts / files.ts / sync.ts  代码扫描 → JSON
excel/*                         JSON ↔ Excel
```

Excel 依赖建议使用 `exceljs`，并通过动态 `import()` 只在执行 `excel` 子命令时加载，避免普通 `sync/check` 启动时承担 Excel 库成本。

## 12. 第一版必测范围

- JSON → Excel → JSON 无变化往返。
- 中文、emoji、单双引号、反引号、换行和占位符。
- `=`、`+`、`-`、`@` 开头的普通文本。
- 新增、更新、单语言缺失、整行缺失。
- 三种 `--blank` 模式。
- `--prune` 与 `--allow-empty` 组合保护。
- 重复 key、空 key、重复表头、缺少 locale 列、未知列。
- 数字、布尔、日期、公式、hyperlink、rich text。
- 非法 JSON、损坏 XLSX、错误 sheet、文件不存在。
- `--dry-run` 完全不写文件。
- Excel 被占用时不产生部分 JSON 更新。
- 备份、回滚和保留数量。
- 多 project、多个独立 Excel 文件互不污染。
- 两个 project 指向同一个 Excel 路径时拒绝启动。
- `--project` 只读写对应项目的 Excel 和 catalogs。
- 不传 `--project` 时分别处理所有配置了 Excel 的项目。
- 隐藏 metadata sheet 不计入用户可见翻译 sheet。
- Windows 路径、中文目录和特殊 key，例如 `__proto__`。
- 如果开启 tracking：JSON 单边修改、Excel 单边修改、双方相同修改、双方冲突修改。

## 13. 实施前需要确认

已经确认：

- 一个 project 对应一个独立 `.xlsx` 文件。
- 每个文件只有一个 CLI 管理的可见翻译 sheet；隐藏 metadata sheet 是唯一的 CLI 内部附加 sheet。
- CLI 继续使用可重复的 `--project` 选择项目，不增加 `--workbook` 和 `--sheet`。

其余实施前需要确认：

1. 是否第一版就实现隐藏 metadata 和三方冲突检测？推荐：是，即方案 B。
2. 空单元格默认是否采用 `preserve`？推荐：是。
3. 语言表头是否允许配置为“中文 / English”，还是必须使用 `zh_CN / en_US`？推荐：允许映射，但 metadata 固定记录真实 locale。
4. 是否默认创建备份，只通过 `--no-backup` 关闭？推荐：是。
5. 删除参数是否使用独立的 `--prune`，不复用现有代码扫描的 `--clean`？推荐：是，以保持参数隔离。
