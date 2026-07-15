<script setup lang="ts">
import { createJsonStorage, i18n } from '@bubblesjs/i18n-core'
import type { Messages } from '@bubblesjs/i18n-core'
import I18nProvider from '@/i18n/provider.vue'

const localeLoaders = import.meta.glob<{ default: Messages }>('./locales/*.json')

const loaderMessage = async (locale?: string) => {
  if (!locale) return undefined

  const loader = localeLoaders[`./locales/${locale}.json`]
  return loader ? (await loader()).default : undefined
}

const leftStore = await i18n.init({
  locale: 'zh_CN',
  loaderMessage,
  storageKey: 'i18n-home-left',
  storage: createJsonStorage(localStorage),
})
</script>

<template>
  <I18nProvider :store="leftStore">
    <RouterView />
  </I18nProvider>
</template>

<style scoped></style>
