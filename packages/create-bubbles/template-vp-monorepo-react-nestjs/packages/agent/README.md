# agent

Node.js + TypeScript 智能体 SDK。主代理、同进程子代理和独立 Node.js 进程代理统一通过 `bootstrapAgent()` 初始化，复用模型与工具执行内核。

支持 Anthropic Messages、OpenAI Chat Completions、本地工具、声明式子代理、会话隔离、整树预算、取消和生命周期事件。要求 Node.js `>=22`，输出 ESM 和类型声明。

在当前目录运行 `vp run build` 构建，`vp run test` 构建并执行专项测试，`vp check` 检查格式、lint 与类型。

正式文档：[需求](../../.spaces/10.智能体SDK/通用运行时/需求文档.md)、[设计](../../.spaces/10.智能体SDK/通用运行时/设计方案.md)、[API 与使用示例](../../.spaces/10.智能体SDK/通用运行时/技术契约.md)、[测试报告](../../.spaces/10.智能体SDK/通用运行时/测试报告.md)、[交付记录](../../.spaces/10.智能体SDK/通用运行时/交付记录.md)。
