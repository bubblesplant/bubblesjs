import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@bubblesjs/utils": fileURLToPath(
        new URL("../../packages/utils/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  run: {
    tasks: {
      bundle: {
        command: "vp build",
        cache: {
          env: ["NODE_ENV"],
        },
      },
    },
  },
});
