<script setup lang="ts">
import I18nProvider from '@bubblesjs/i18n-vue'
import AppProviders from '@/components/application/AppProviders.vue'
import { leftStore } from '@/i18n/instance'
</script>

<template>
  <I18nProvider :store="leftStore">
    <AppProviders />
  </I18nProvider>
</template>
