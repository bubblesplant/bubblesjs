## 菜单图标规则

- 新增或调整菜单路由时，先检查 `apps/web/src/assets/svg/` 及其子目录是否已有语义匹配的 SVG，优先复用现有资源。
- 没有合适图标时，新增 SVG 到 `apps/web/src/assets/svg/`，保留 `viewBox`，单色图标使用 `currentColor`，源文件使用 `width="1em"` 和 `height="1em"`，不得写死颜色或像素尺寸。
- 页面目录中的 `icon` 必须填写 SVG 文件名去掉 `.svg` 后的稳定 key；不要重新添加 Ant Design 菜单图标映射，也不要把 SVG 内容、HTML 或远程 URL 写入菜单配置。
- 新增 SVG 会被图标选择器自动发现；实现菜单页面时必须补充导航、表单回显和图标选择器相关测试。
