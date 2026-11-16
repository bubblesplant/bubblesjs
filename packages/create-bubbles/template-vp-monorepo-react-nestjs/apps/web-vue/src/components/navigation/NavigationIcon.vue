<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name?: string }>()
// 只使用本应用编译期收集的静态资源；未知菜单图标与 React 一样回退到 menu-item。
const assets = import.meta.glob<string>('/src/assets/navigation/*.svg', {
  eager: true,
  import: 'default',
  query: '?raw',
})
const iconSvg = computed(
  () =>
    assets[`/src/assets/navigation/${props.name}.svg`] ??
    assets['/src/assets/navigation/menu-item.svg'],
)
</script>

<template>
  <span class="workspace-navigation-icon" aria-hidden="true" v-html="iconSvg" />
</template>

<style scoped>
.workspace-navigation-icon {
  display: inline-flex;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  vertical-align: -0.125em;
}
.workspace-navigation-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
