<script setup>
import InfiniteScroll from './index.vue'
import { ref } from 'vue'

const items = ref(['Item 1', 'Item 2', 'Item 3'])

setTimeout(() => {
  items.value.push('Item 4')
}, 3000)
</script>

<template>
  <div style="height: 200px;">
    <InfiniteScroll :animation-time="10">
      <div v-for="item in items" :key="item">{{ item }}</div>
    </InfiniteScroll>
  </div>
</template>