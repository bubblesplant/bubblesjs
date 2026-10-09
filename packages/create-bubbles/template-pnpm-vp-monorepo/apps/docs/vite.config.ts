import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      bundle: {
        command: "vitepress build .",
        cache: { env: ["DOCS_BASE", "NODE_ENV"] },
      },
    },
  },
});
