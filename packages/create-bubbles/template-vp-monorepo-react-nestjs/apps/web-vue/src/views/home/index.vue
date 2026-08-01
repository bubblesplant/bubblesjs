<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'

const { tr, loadLocale } = useI18n()
</script>

<template>
  <div class="flex-center flex-col gap-4 h-full w-full">
    1111
    <h1 class="text-2xl font-bold">
      {{ tr('保存') }}
    </h1>
    <p class="text-gray-500">
      {{ tr('你好1') }}
    </p>

    <a class="text-white px-4 py-2 rounded-md bg-blue-500" @click="loadLocale('en_US')">
      {{ tr('English') }}
    </a>

    <a class="text-white px-4 py-2 rounded-md bg-blue-500" @click="loadLocale('zh_CN')">
      {{ tr('中文') }}
    </a>
  </div>
</template>

<style lang="scss" scoped></style>
