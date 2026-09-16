1. 开通企业的 时候 首位管理员账号 这个我想建一个选择器 但是 想这个 是不是要分权限 比如 平台有所有 企业有企业所有 项目有项目所有 添加成员的时候 而且 左边视乎还需要一个分企业 分项目的选择
   也可以直接搜 搜出来 还要带 企业和项目 如果是企业级账号搜出来 就是由项目标识就行 项目

---------------------------------以下已完成 不用看--------------------------

1. skills 增加
   在做之前思考 有哪些是公用的组件

全局公用 组件放在 @/components 目录下
局部公用 组件放在引用的最小公共目录下 当有超出这个最小公共目录的 就需要移动到最新的 最小公共目录
componets 尽可能放一些通用的组件

一些静态变量和静态组件不要放在 react 组件方法内 可以在方法外（小 且页面独有） 或者抽离一个文件（config/index） 或components/xxx 内

这个规则 也同步到 skills/init-agent-rules/SKILL.md

2. 这个项目的 brand 可以提成公共组件

3.RouteTransition
这里要分成三种页面 来使用 <RouteTransition /> 整个页面的 就直接包
apps/web/src/layouts/WorkspaceLayout/index.tsx:161~163 这个加RouteTransition

4. apps/web/src/layouts/BasicLayout/index.tsx 这个layout 是干嘛的 为什么不直接用 WorkspaceLayout

5. 前端使用@bubblesjs/i18n-core": "workspace:_",
   "@bubblesjs/i18n-react": "workspace:_",

实现国际化 这个只管前端

6. apps/web/README.MD 加个规则 国际化的
