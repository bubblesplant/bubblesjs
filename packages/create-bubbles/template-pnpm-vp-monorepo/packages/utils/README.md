# @bubblesjs/utils

模板中的内部共享 TypeScript 工具包，设置了 `private: true`，不发布到 npm。包名 `@bubblesjs/utils` 保留为工作区内部标识。通过 Vite+ Pack 输出 ESM、CommonJS 和对应的类型声明；应用通过 `workspace:*` 依赖它。

```ts
import { clamp } from "@bubblesjs/utils";

clamp(125, 0, 100); // 100
clamp(-20, 0, 100); // 0
clamp(42, 0, 100); // 42
```

`clamp(value, min, max)` 要求参数均为有限数值，且 `min <= max`，否则抛出 `RangeError`。原有 `fn()` 导出保留，返回 `Hello, tsdown!`。

在仓库根目录运行：

```bash
pnpm --filter @bubblesjs/utils test
pnpm --filter @bubblesjs/utils build
pnpm --filter @bubblesjs/utils typecheck
pnpm --filter @bubblesjs/utils verify:package
```

`verify:package` 以及根目录的 `pnpm verify:packages` 仅检查本地 ESM/CJS、类型声明和打包文件，不执行 npm 发布。

复制为内部共享包时保留 `private: true`。若将来复制为公开包，例如 `@bubblesjs/math`，须显式移除 `private: true`，设置 `publishConfig.access` 为 `public` 并完善发布元信息。发布到 npm 的账户需拥有 `@bubblesjs` scope 或对应组织的包发布权限。维护 `tests/consumer` 中的双格式消费类型测试和 `scripts/verify-package.mjs` 中的运行验证；仅在更换 scope 时同步替换 `@bubblesjs` 的引用。
