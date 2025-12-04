<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import plusZhCn from 'plus-pro-components/es/locale/lang/zh-cn'

const locale = {
  ...zhCn,
  ...plusZhCn,
}
</script>

<template>
  <el-config-provider
    :locale="locale"
  >
    <RouterView />
  </el-config-provider>
</template>

<style scoped></style>
