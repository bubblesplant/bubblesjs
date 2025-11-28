<script setup lang="ts">
import AiMarkdownRender from '../../../../AiMarkdown/index.vue'

const { content, markdownCodeRenderConfig } = defineProps<{
  content: string
  markdownCodeRenderConfig?: InstanceType<typeof AiMarkdownRender>['markdownCodeRenderConfig']
}>()
</script>

<template>
  <div>
    <AiMarkdownRender :markdown="content" :markdown-code-render-config="markdownCodeRenderConfig" />
  </div>
</template>

<style lang="scss" scoped>

</style>
