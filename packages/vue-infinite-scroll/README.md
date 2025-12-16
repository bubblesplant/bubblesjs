### 安装

pnpm install @bubblesjs/vue-infinite-scroll


### 使用

```vue
<template>
 <InfiniteScoll :animation-time="20">
  <div v-for="row in tableData" :key="row.id" class="table-row">
    <div class="cell" style="width: 60px">{{ row.id }}</div>
    <div class="cell" style="width: 80px">{{ row.name }}</div>
    <div class="cell" style="width: 60px">{{ row.age }}</div>
    <div class="cell" style="width: 80px">{{ row.city }}</div>
    <div class="cell" style="width: 160px">{{ row.email }}</div>
  </div>
</InfiniteScoll>
</template>


<script setup lang="ts">
import { InfiniteScoll } from '@bubblesjs/vue-infinite-scroll'
</script>
```




