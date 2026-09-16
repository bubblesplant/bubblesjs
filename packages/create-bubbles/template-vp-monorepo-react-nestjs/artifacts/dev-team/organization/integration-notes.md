# 企业层级、组织架构、岗位与成员选择器联调记录

状态：阶段 4 联调完成，阶段 5 浏览器验收仍受 Playwright 环境限制。日期：2026-09-16。

本记录依据已确认的 [PRD](./PRD.md) 与 [实施契约](./contract.md)，只记录本功能的共享契约、数据库、Server、React Web 及联调回流，不把项目原有问题或尚未执行的浏览器验收记为通过。

## 1. 联调结论

- Shared、数据库 schema／migration、NestJS 领域实现及 React Web 主体已经接入同一份组织契约。
- 契约要求的 47 个实际受影响端点均可在 Controller 源码中定位，5 个组织 Controller 已由 `OrganizationModule` 注册，模块已进入 `AppModule`。
- 新增权限目录为 22 个 key；新增领域错误码为 7 个，均已定义并在业务代码中使用。
- Drizzle `0002 → 0003` 快照差异为 10 张新表、97 个新表字段和 `companies` 4 个新增字段，合计 101 个字段变更。
- 前端第 6 轮跨工作空间隔离修复已完成；Web 全量测试 14 个文件、106/106 通过，`pnpm --filter web build`（TypeScript + 前端构建）及测试 TypeScript 检查通过，全部前端变更代码文件的 `vp check` 通过。
- 同一开发会话此前已在隔离 PostgreSQL／Redis 环境运行权限与组织真实集成测试，19/19 通过；本次文档复核环境没有数据库／Redis连接信息，且 Docker daemon 未运行，因此本轮没有重复执行该组真实集成测试。
- 当前工作区没有 Playwright 依赖或可执行命令，未安装任何新依赖。浏览器关键流程仍是最终验收缺口，详见 [测试报告](./test-report.md)。

## 2. 契约落地核对

### 2.1 Shared

- 组织模型、请求／响应类型、strict Zod schema、规范化方法和访问目录均由 `packages/shared` 导出，Web 与 Server 未各自复制第二份传输 DTO。
- `ScopeType` 和数据库访问作用域仍只有 `platform | company | project`；集团继续由 company 的 `entityType = group` 表达。
- 组织、岗位、模板和候选 DTO 使用 `userId`、单整数 `sort`、独立岗位以及无主归属关系模型。
- 本轮直接执行 `pnpm --filter shared test`：2 个测试文件、14/14 通过。
- 本轮直接执行 `pnpm --filter shared build`：构建成功，产出 9 个文件。

### 2.2 数据库与迁移

Drizzle 快照对比结果：

| 项目                 | 结果 |
| -------------------- | ---: |
| 新增表               |   10 |
| 新增表字段           |   97 |
| `companies` 新增字段 |    4 |
| 总字段变更           |  101 |

新增表为：

1. `organization_trees`
2. `organization_units`
3. `company_organization_unit_members`
4. `project_organization_unit_members`
5. `positions`
6. `company_position_members`
7. `project_position_members`
8. `organization_templates`
9. `organization_template_units`
10. `organization_template_positions`

`0003_cute_killmonger.sql` 包含企业／项目 code 和企业同父名称的迁移前检查、空组织树补建及批次标记；`rollback/0003_organization_backfill.sql` 只允许删除本批次、仍为空且无业务引用的树。真实集成测试的初始化会创建随机数据库并连续调用两次 Drizzle migrate；旧库非空回滚脚本本轮未在独立数据库再次执行，最终发布前仍建议保留一次专门演练。

### 2.3 Server 端点

契约表中的 43 个端点和 4 个既有行为变更端点已全部定位：

| 能力组                                                           | 实际端点数 | 注册／实现位置                                                           |
| ---------------------------------------------------------------- | ---------: | ------------------------------------------------------------------------ |
| 企业层级、全局账号候选及 4 个修改请求 DTO 的既有创建／管理员端点 |          8 | `companies.controller.ts`、`projects.controller.ts`、全局候选 Controller |
| 企业／项目组织单元与组织关系                                     |         14 | `organization/units/organization-units.controller.ts`                    |
| 企业／项目岗位与岗位任职                                         |         12 | `organization/positions/positions.controller.ts`                         |
| 企业／项目组织成员候选搜索与 resolve                             |          4 | `organization/candidates/member-candidates.controller.ts`                |
| 企业项目组织模板                                                 |          5 | `organization/templates/organization-templates.controller.ts`            |
| 企业／项目资料更新及企业／项目成员移除行为变更                   |          4 | 既有 companies、projects、members Controller                             |
| 合计                                                             |         47 | 43 个契约表端点 + 4 个既有行为变更端点                                   |

所有新增组织 Controller 均显式声明 `@AccessPolicy`；候选端点由 service 按 purpose 做最小权限判断和响应裁剪。

### 2.4 权限、错误码与审计

- 运行构建后的 Shared 目录检查得到 22 个本期权限 key，数量与名称均与契约一致；5 个新增页面 routeKey 均进入 `ACCESS_PAGE_CATALOG`，并由同一目录派生 `ACCESS_PERMISSION_CATALOG` 与菜单种子。
- `ACCESS_CATALOG_VERSION` 已提升为 `2026-09-16.1`。
- 企业、项目路由模块和 Web page registry 已注册企业组织、企业岗位、组织模板、项目组织和项目岗位页面。
- 7 个新增错误码均在 `ACCESS_ERRORS` 定义并至少有一个业务抛出点：
  - `ORGANIZATION_CYCLE`
  - `ORGANIZATION_DEPTH_EXCEEDED`
  - `ORGANIZATION_LEADER_CONFLICT`
  - `ORGANIZATION_SORT_EXHAUSTED`
  - `INVALID_MEMBER_RELATION`
  - `TEMPLATE_VERSION_CONFLICT`
  - `TEMPLATE_UNAVAILABLE`
- 组织、岗位、模板、初始化和关系替换使用契约规定的审计 action；真实集成测试覆盖项目创建审计失败时事务整体回滚，以及成员移除后的清理数量摘要。

## 3. 前后端联调状态

### 3.1 已接通路径

- 企业与项目工作空间分别注册组织、岗位页面，企业额外注册项目组织模板页面。
- `GlobalAccountSelect` 以 `userId` 为值并支持搜索、resolve、快照回显、取消和失败去重。
- `OrganizationMemberSelector` 独立于 `BasicTableSelector`，通过当前 URL 作用域查询既有成员，并保留组织、岗位和角色的独立标签语义。
- 企业／项目组织、岗位、成员归属和模板页面均通过 Shared 类型调用 Server 端点。
- 组织树缓存和每次请求均绑定其所有者 `workspaceKey`；工作空间切换后，旧作用域不能借用新 generation 发出请求，旧在途结果仍会被取消或丢弃。
- 跨路由导航等待时卸载旧页面及其 React portal；同路由权限重校验时保留页面和受页面树管理的弹窗本地状态，同时对页面 surface 与专属 portal host 设置 `hidden + inert`。两类等待均清理不受上下文管理的静态 Modal，服务端候选搜索继续负责分页、去重和权限裁剪。

### 3.2 缺陷回流

本功能共完成六轮跨层回流：

1. 补齐平台全局账号 search／resolve、企业层级鉴权、Query 数组兼容和岗位候选作用域校验。
2. 修复 leader 原子交接、当前项目权限读取边界，以及 GlobalAccountSelect 的 resolve／取消／缓存行为。
3. 修复 GlobalAccountSelect 初始 resolve 被搜索 effect 误取消的竞态，并清理定向格式与 lint 问题。
4. 完成前端竞态收口：同一作用域连续点击 A→B 时，A 的慢请求不再覆盖 B 弹窗，A 的旧 `finally` 不再清除 B 的 loading，失效请求不会继续执行成功或失败回调；组织成员候选在快照补查、上下文切换、loader 切换和项目筛选切换时均忽略旧请求迟到结果。`latest-dialog-request.spec.ts`、`organization-assignment.spec.ts` 与 `selector/organization-member-selector.spec.ts` 提供专项回归，其中新增组织成员选择器竞态 6/6 通过。
5. 修复跨工作空间导航期间旧页面 portal 仍可交互、旧 API 工厂请求可能借用新 generation 发出的隔离漏洞。API 和路由 loader 显式传递所有者 `workspaceKey`，旧作用域请求会在底层 `send` 前以 `AbortError` 拒绝；导航等待期间卸载旧页面及其 React portal，并清理静态 Modal。
6. 区分跨路由导航与同路由权限重校验：导航继续卸载旧页面；权限重校验改为保留表单和受页面树管理的弹窗本地状态，但同步隐藏并禁用页面 surface 与专属 portal host。`workspace-requests.spec.ts` 覆盖同 key 重入、A→B→C、旧 scope owner key 和当前空间 401，`router/entry.spec.ts` 与 `router/workspace-data.spec.ts` 核对入口及目标作用域 owner key，`workspace-navigation-boundary.spec.tsx` 覆盖导航卸载、重校验状态保留、`hidden + inert` 和静态 Modal 清理。

## 4. 本轮验证记录

| 检查                   | 命令／证据                                                                          | 结果                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Shared 单元测试        | `pnpm --filter shared test`                                                         | 2 文件，14/14 通过                                                             |
| Shared 构建            | `pnpm --filter shared build`                                                        | 通过，9 个产物文件                                                             |
| Server 普通测试        | `pnpm --filter server test`                                                         | 5 文件通过、2 文件环境门控跳过；26/26 已运行测试通过，20 项跳过                |
| Server TypeScript      | `pnpm exec tsc --noEmit -p apps/server/tsconfig.json`                               | 通过                                                                           |
| Server 构建            | `pnpm --filter server build`                                                        | 127 个文件编译成功                                                             |
| Web 全量测试           | `pnpm --filter web test`                                                            | 14 个文件、106/106 通过；无失败、无跳过                                        |
| Web 测试 TypeScript    | `pnpm exec tsc --noEmit -p apps/web/test/tsconfig.json`                             | 通过                                                                           |
| Web TypeScript 与构建  | `pnpm --filter web build`                                                           | 通过                                                                           |
| 前端变更代码检查       | 对全部前端变更代码文件执行 `vp check`                                               | 通过                                                                           |
| 前端差异检查           | `git diff --check -- apps/web` 及对应 cached 检查                                   | 退出码均为 0；仅有 LF→CRLF 提示，不影响检查结论                                |
| 真实 PostgreSQL／Redis | 同一开发会话此前设置 `RUN_ACCESS_INTEGRATION=true` 及脱敏连接参数后运行 Server 测试 | `access.integration.spec.ts` 19/19 通过；本轮未复跑                            |
| 表／字段核对           | 对比 `0002_snapshot.json` 与 `0003_snapshot.json`                                   | 10 张新表、97 + 4 = 101 个字段变更                                             |
| 权限目录核对           | 加载 Shared 构建产物并筛选本期 key                                                  | 22/22；5 个页面 routeKey 齐全                                                  |
| 错误码核对             | 搜索定义、抛出点与集成断言                                                          | 7/7 均定义并使用                                                               |
| 排除范围扫描           | 扫描 Shared、Server、Web 和 migration                                               | 未发现项目小组、主归属、`memberSort`、岗位－组织持久关联或工作流目标／发布能力 |
| Playwright 能力        | `pnpm exec playwright --version`                                                    | 命令不存在；未安装                                                             |

普通 Server 测试中的 20 个跳过项是 19 个访问／组织真实集成用例和 1 个队列真实集成用例；它们没有被计入本轮 26 个通过项。组织相关的 19 个真实用例只引用同一开发会话此前的独立环境结果。

## 5. 明确排除范围复核

静态扫描未发现以下禁用概念进入 `packages/shared/src`、`apps/server/src`、`apps/web/src` 或 Drizzle migration：

- 项目小组或第四种 AccessScope。
- 主归属、默认组织、`primaryOrganization`、`isPrimary` 或 `memberSort`。
- 岗位、模板岗位到组织单元的持久关联。
- `WorkflowTargetSelector`、企业组织目标发布、运行时接收人、项目工作流权限或任务级资源授权。

组织、岗位和模板 Controller 没有 DELETE 端点；成员组织关系和岗位任职仍通过全量替换解除。

## 6. 剩余验收与发布前检查

1. 当前项目没有 Playwright。按 QA 规则，需要用户选择准备 Playwright 环境继续 E2E，或接受单元、接口、真实数据库、构建和静态检查作为本轮替代证据。
2. 若选择继续 E2E，应覆盖组织树移动后的缓存失效、工作空间快速切换与权限重校验，确认真实浏览器中导航会卸载旧页面及 portal，重校验会保留表单状态但使页面与 portal host 均不可见、不可交互，静态 Modal 已关闭，且焦点、鼠标或键盘均不能触发旧作用域写入；同时覆盖选择器分页／搜索／同名展示／禁选、权限按钮和服务端 403 的一致性。
3. 前端全量测试、构建、变更代码检查和 apps/web 差异检查均已完成；文档收口继续执行定向差异检查，不得为本功能批量改写全仓历史格式问题。
4. 发布前建议在隔离旧库额外演练一次 `0003` backfill 与受保护 rollback，留存非空存量数据场景的运行日志。
