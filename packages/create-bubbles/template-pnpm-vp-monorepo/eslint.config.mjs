import antfu from "@antfu/eslint-config";

export default antfu(
  {
    formatters: false,
    lessOpinionated: true,
    stylistic: false,
    typescript: true,
    vue: true,
    ignores: ["**/dist/**", "**/coverage/**", "**/.vitepress/cache/**", "**/.vitepress/dist/**"],
  },
  {
    files: ["**/*.vue"],
    rules: {
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
    },
  },
);
