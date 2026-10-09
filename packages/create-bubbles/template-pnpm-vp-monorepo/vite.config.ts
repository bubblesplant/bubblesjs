import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,json,jsonc,yaml,yml,md,css,scss}": "vp check --fix",
    "*.vue": ["vp fmt --write", "eslint --fix --max-warnings=0"],
  },
  fmt: {
    ignorePatterns: [
      "**/dist/**",
      "**/coverage/**",
      "**/.vitepress/cache/**",
      "**/.vitepress/dist/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "**/dist/**",
      "**/coverage/**",
      "**/.vitepress/cache/**",
      "**/.vitepress/dist/**",
      "**/*.vue",
      "packages/utils/tests/consumer/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: { scripts: false, tasks: true },
    tasks: {
      quality: {
        command: ["pnpm format:check", "pnpm lint", "pnpm typecheck", "pnpm test"],
        cache: false,
      },
    },
  },
});
