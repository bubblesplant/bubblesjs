<script setup lang="ts">
import I18nProvider from '@bubblesjs/i18n-vue'
import { leftStore } from '@/i18n/instance'
</script>

<template>
  <I18nProvider :store="leftStore">
    <RouterView />
  </I18nProvider>
</template>

<style scoped></style>
