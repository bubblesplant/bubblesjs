<script lang="ts" setup>
import { XMarkdown } from 'vue-element-plus-x'

import './github-css.css'

const { markdown, markdownCodeRenderConfig } = defineProps<{
  markdown: string
  markdownCodeRenderConfig?: InstanceType<typeof XMarkdown>['codeXRender']
}>()
</script>

<template>
  <XMarkdown :markdown="markdown" :code-x-render="markdownCodeRenderConfig" class="markdown-body" />
</template>

<style>
.markdown-body hr {
  height: 1px;
}
.markdown-body pre {
  padding: 0;
  background-color: transparent;
}
</style>
