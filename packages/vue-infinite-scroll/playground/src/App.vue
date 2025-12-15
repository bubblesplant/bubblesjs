<script setup lang="ts">
import { ref } from 'vue'
import { InfiniteScoll } from '../../src'

interface TableRow {
  id: number
  name: string
  age: number
  city: string
  email: string
}

// 造 30 条测试数据
const tableData = ref<TableRow[]>(
  Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    name: `用户${i + 1}`,
    age: 20 + (i % 30),
    city: ['北京', '上海', '广州', '深圳', '杭州'][i % 5],
    email: `user${i + 1}@example.com`,
  }))
)

const columns = [
  { key: 'id', label: 'ID', width: '60px' },
  { key: 'name', label: '姓名', width: '80px' },
  { key: 'age', label: '年龄', width: '60px' },
  { key: 'city', label: '城市', width: '80px' },
  { key: 'email', label: '邮箱', width: '160px' },
]
</script>

<template>
  <div class="table-container">
    <!-- 固定表头 -->
    <div class="table-header">
      <div
        v-for="col in columns"
        :key="col.key"
        class="header-cell"
        :style="{ width: col.width }"
      >
        {{ col.label }}
      </div>
    </div>

    <!-- 无限滚动表体 -->
    <div class="table-body">
      <InfiniteScoll :animation-time="20">
        <div v-for="row in tableData" :key="row.id" class="table-row">
          <div class="cell" style="width: 60px">{{ row.id }}</div>
          <div class="cell" style="width: 80px">{{ row.name }}</div>
          <div class="cell" style="width: 60px">{{ row.age }}</div>
          <div class="cell" style="width: 80px">{{ row.city }}</div>
          <div class="cell" style="width: 160px">{{ row.email }}</div>
        </div>
      </InfiniteScoll>
    </div>
  </div>
</template>

<style scoped>
.table-container {
  width: 500px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.table-header {
  display: flex;
  background: #f5f5f5;
  font-weight: bold;
  border-bottom: 2px solid #ddd;
}

.header-cell {
  padding: 12px 8px;
  text-align: left;
  flex-shrink: 0;
}

.table-body {
  height: 300px;
}

.table-row {
  display: flex;
  border-bottom: 1px solid #eee;
}

.table-row:hover {
  background: #f9f9f9;
}

.cell {
  padding: 10px 8px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
