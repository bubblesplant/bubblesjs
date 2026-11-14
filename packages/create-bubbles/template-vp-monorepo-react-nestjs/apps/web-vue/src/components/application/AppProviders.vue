<script setup lang="ts">
import { enUSIntl, ProProvider, zhCNIntl } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { App as AntApp, ConfigProvider } from 'antdv-next'
import enUS from 'antdv-next/locale/en_US'
import zhCN from 'antdv-next/locale/zh_CN'
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

const { locale, tr } = useI18n()
const route = useRoute()
const theme = {
  token: {
    colorPrimary: '#7864c4',
    colorBgLayout: '#f5f3fc',
    colorText: '#302b49',
    colorTextSecondary: '#78718e',
    colorBorder: '#e1ddec',
    borderRadius: 12,
    controlHeight: 36,
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  components: {
    Card: { borderRadiusLG: 18 },
    Menu: { itemBorderRadius: 10 },
  },
}
const antdLocale = computed(() => (locale.value === 'en_US' ? enUS : zhCN))
const proIntl = computed(() => (locale.value === 'en_US' ? enUSIntl : zhCNIntl))
watchEffect(() => {
  document.title = `${tr(String(route.meta.title ?? '工作空间'))} · Bubbles`
  document.documentElement.lang = locale.value === 'en_US' ? 'en' : 'zh-CN'
})
</script>

<template>
  <ConfigProvider :locale="antdLocale" :theme="theme">
    <ProProvider :intl="proIntl">
      <AntApp><RouterView /></AntApp>
    </ProProvider>
  </ConfigProvider>
</template>
