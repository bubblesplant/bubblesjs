import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: { generator: "tsc" },
    platform: "neutral",
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  run: {
    tasks: {
      bundle: { command: "vp pack", cache: { env: ["NODE_ENV"] } },
    },
  },
});
