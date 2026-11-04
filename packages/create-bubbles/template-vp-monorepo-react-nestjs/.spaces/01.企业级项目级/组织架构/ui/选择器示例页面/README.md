# 选择器示例页面

真实路由 `/examples/selector`，所有候选均为虚构数据。六张截图由[浏览器验证脚本](../../工具/选择器示例页面/verify.mjs)生成，已检查文件及画面。

| 截图                                                 | 场景                                   |
| ---------------------------------------------------- | -------------------------------------- |
| [desktop.png](./desktop.png)                         | 企业级初始回显；表单与当前 JSON 双栏   |
| [organization-duties.png](./organization-duties.png) | 开启职责后选择组织并修改为副负责人     |
| [submitted.png](./submitted.png)                     | 项目级表单的真实提交 JSON              |
| [organization-scroll.png](./organization-scroll.png) | 32 个组织已选，容器内部滚动            |
| [mobile.png](./mobile.png)                           | 390px 窄屏采用单列表单                 |
| [mobile-dialog.png](./mobile-dialog.png)             | 390px 选择弹窗上下排列，已选区独立滚动 |

纯组织与带职责组织分别保存 `string[]` 和 `{ organizationUnitId, duty }[]`。提交值见[实际 JSON](../../测试证据/选择器示例页面/submitted.json)，验证范围与结果见[测试报告](../../测试报告.md#2026-11-04-选择器示例页面专项)。
