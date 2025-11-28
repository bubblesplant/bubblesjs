<script setup lang="ts">
const { content } = defineProps<{
  content: string
}>()
</script>

<template>
  <div class="flex justify-end">
    <div class="max-w-500px rounded-[16px_0px_16px_16px] bg-[#0000000a] p-16px">
      {{ content }}
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
