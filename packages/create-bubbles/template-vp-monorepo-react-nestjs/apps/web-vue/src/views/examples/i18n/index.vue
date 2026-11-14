<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'
import { Button, Card, Input, Space } from 'antdv-next'
import { ref } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'

const { tr, locale, loadLocale } = useI18n()
const name = ref('Bubbles')
</script>

<template>
  <PageHeading
    :title="tr('国际化示例')"
    :description="tr('语言偏好会持久化，并同步 Ant Design、日期和整个前端界面。')"
  />
  <Card :title="tr('应用级语言')">
    <Space direction="vertical" :size="20">
      <Input v-model:value="name" :aria-label="tr('姓名')" />
      <h2>{{ tr('你好，{name}', { name }) }}</h2>
      <span>{{ tr('当前语言：{locale}', { locale: locale ?? 'zh_CN' }) }}</span>
      <Button type="primary" @click="loadLocale(locale === 'zh_CN' ? 'en_US' : 'zh_CN')">
        {{ tr('切换到 {locale}', { locale: locale === 'zh_CN' ? 'en_US' : 'zh_CN' }) }}
      </Button>
    </Space>
  </Card>
</template>
