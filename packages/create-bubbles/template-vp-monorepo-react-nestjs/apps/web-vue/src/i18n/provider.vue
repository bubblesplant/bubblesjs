<script setup lang="ts">
import type { I18nStore } from '@bubblesjs/i18n-core'
import { I18nScopeKey } from './context';

const { store } = defineProps<{
  store: I18nStore
}>()

const storeKey: InjectionKey<I18nStore> = Symbol('i18n-store')


provide(I18nScopeKey, storeKey)
provide(storeKey, store)

</script>

<template>
  <slot />
</template>
