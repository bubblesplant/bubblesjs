<script setup lang="ts">
import type { Label, Relation } from '../../src'
import { ref } from 'vue'
import { Annotator } from '../../src'

// 实体数据接口（简化版，组件内部会转换为 Entity 类）
interface EntityData {
  id: number
  label: number
  startOffset: number
  endOffset: number
}

// 示例文本
const text = ref('我是一个标注组件的示例文本。这里可以添加实体标注和关系标注。你可以选中文字来创建新的实体。')

// 实体标签定义
const entityLabels = ref<Label[]>([
  { id: 1, text: '人物', color: '#4CAF50', backgroundColor: '#4CAF50' },
  { id: 2, text: '地点', color: '#2196F3', backgroundColor: '#2196F3' },
  { id: 3, text: '组织', color: '#FF9800', backgroundColor: '#FF9800' },
  { id: 4, text: '时间', color: '#9C27B0', backgroundColor: '#9C27B0' },
])

// 关系标签定义
const relationLabels = ref<Label[]>([
  { id: 1, text: '属于', color: '#E91E63', backgroundColor: '#E91E63' },
  { id: 2, text: '位于', color: '#00BCD4', backgroundColor: '#00BCD4' },
])

// 实体列表
const entities = ref<EntityData[]>([
  { id: 1, label: 1, startOffset: 0, endOffset: 1 }, // "我"
  { id: 2, label: 3, startOffset: 4, endOffset: 8 }, // "标注组件"
  { id: 3, label: 2, startOffset: 17, endOffset: 21 }, // "实体标注"
])

// 关系列表
const relations = ref<Relation[]>([
  { id: 1, labelId: 1, fromId: 1, toId: 2 },
])

// 选中的实体
const selectedEntities = ref<EntityData[]>([])

// 当前选中的标签 ID（用于创建新实体）
const currentLabelId = ref(1)

// 下一个实体 ID
let nextEntityId = 4
let nextRelationId = 2

// 事件处理函数
function handleAddEntity(_event: TouchEvent | MouseEvent, startOffset: number, endOffset: number) {
  const newEntity: EntityData = {
    id: nextEntityId++,
    label: currentLabelId.value,
    startOffset,
    endOffset,
  }
  entities.value = [...entities.value, newEntity]
}

function handleClickEntity(_event: Event, entityId: number) {
  const entity = entities.value.find(e => e.id === entityId)
  if (entity) {
    const index = selectedEntities.value.findIndex(e => e.id === entityId)
    if (index > -1) {
      selectedEntities.value = selectedEntities.value.filter(e => e.id !== entityId)
    }
    else {
      selectedEntities.value = [...selectedEntities.value, entity]
    }
  }
}

function handleContextmenuEntity(entity: EntityData) {
  // 右键删除实体
  entities.value = entities.value.filter(e => e.id !== entity.id)
  relations.value = relations.value.filter(r => r.fromId !== entity.id && r.toId !== entity.id)
}

function handleClickRelation(_event: Event, _relation: unknown) {
  // 点击关系的处理
}

function handleContextmenuRelation(relation: { id: number }) {
  // 右键删除关系
  relations.value = relations.value.filter(r => r.id !== relation.id)
}

// 创建关系（当选中两个实体时）
function createRelation() {
  if (selectedEntities.value.length === 2) {
    const newRelation: Relation = {
      id: nextRelationId++,
      labelId: 1,
      fromId: selectedEntities.value[0].id,
      toId: selectedEntities.value[1].id,
    }
    relations.value = [...relations.value, newRelation]
    selectedEntities.value = []
  }
}
</script>

<template>
  <div class="app-container">
    <div class="toolbar">
      <span>当前标签：</span>
      <select v-model="currentLabelId">
        <option v-for="label in entityLabels" :key="label.id" :value="label.id">
          {{ label.text }}
        </option>
      </select>
      <button
        :disabled="selectedEntities.length !== 2"
        @click="createRelation"
      >
        创建关系 (选中 {{ selectedEntities.length }}/2)
      </button>
    </div>

    <div class="annotator-wrapper">
      <Annotator
        :text="text"
        :entities="(entities as any)"
        :entity-labels="entityLabels"
        :relations="relations"
        :relation-labels="relationLabels"
        :selected-entities="(selectedEntities as any)"
        :allow-overlapping="false"
        :grapheme-mode="true"
        :dark="false"
        @add-entity="handleAddEntity"
        @click-entity="handleClickEntity"
        @contextmenu-entity="handleContextmenuEntity"
        @click-relation="handleClickRelation"
        @contextmenu-relation="handleContextmenuRelation"
      />
    </div>

    <div class="info-panel">
      <h4>实体列表 ({{ entities.length }})</h4>
      <ul>
        <li v-for="entity in entities" :key="entity.id">
          ID: {{ entity.id }} | 标签: {{ entityLabels.find(l => l.id === entity.label)?.text }} |
          位置: [{{ entity.startOffset }}, {{ entity.endOffset }}]
        </li>
      </ul>

      <h4>关系列表 ({{ relations.length }})</h4>
      <ul>
        <li v-for="relation in relations" :key="relation.id">
          ID: {{ relation.id }} | {{ relation.fromId }} → {{ relation.toId }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  padding: 20px;
  font-family: sans-serif;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar select {
  padding: 4px 8px;
}

.toolbar button {
  padding: 6px 12px;
  cursor: pointer;
}

.toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.annotator-wrapper {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 16px;
  min-height: 200px;
  background: #fafafa;
}

.info-panel {
  margin-top: 20px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 14px;
}

.info-panel h4 {
  margin: 8px 0;
}

.info-panel ul {
  margin: 0;
  padding-left: 20px;
}
</style>
