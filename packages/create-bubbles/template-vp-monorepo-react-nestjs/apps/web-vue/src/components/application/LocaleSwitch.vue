<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'
import { Button } from 'antdv-next'

const { locale, loadLocale } = useI18n()
</script>

<template>
  <Button type="text" @click="loadLocale(locale === 'en_US' ? 'zh_CN' : 'en_US')">
    {{ locale === 'en_US' ? '简体中文' : 'English' }}
  </Button>
</template>
