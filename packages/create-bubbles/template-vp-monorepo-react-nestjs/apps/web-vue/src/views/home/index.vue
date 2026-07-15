<script setup lang="ts">
import { useI18n } from '@/i18n/context'


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

    <a class="bg-blue-500 text-white px-4 py-2 rounded-md" @click="loadLocale('en_US')">
      {{ tr('English') }}
    </a>

    <a class="bg-blue-500 text-white px-4 py-2 rounded-md" @click="loadLocale('zh_CN')">
      {{ tr('中文') }}
    </a>
  </div>
</template>

<style lang="scss" scoped></style>
