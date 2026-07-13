<script setup lang="ts">
import type { I18nStore } from '@bubblesjs/i18n-core'

const { store } = defineProps<{
  store: I18nStore
}>()

provide(store.storageKey, store)
</script>

<template>
  <slot />
</template>
