<script setup lang="ts">
import { createJsonStorage, i18n } from '@bubblesjs/i18n-core'
import I18nProvider from '@/i18n/provider.vue'

const leftStore = await i18n.init({
  locale: 'zh_CN',
  loaderMessage: async (locale?: string) => (await import(`@/locales/${locale}.json`))?.default,
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
