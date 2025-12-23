<script setup lang="ts">
import { h, shallowRef } from 'vue'
import { AiChart } from '../../src'
import {
  chartRequest,
  createConversation,
  deleteConversation,
  getConversationDetail,
  getConversationList,
  mockRecommends,
} from './mock'

const recommends = shallowRef(mockRecommends)

// Logo 组件
function ChartLogo() {
  return h('div', {
    style: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#409EFF',
    },
  }, '🤖 AI 助手')
}
</script>

<template>
  <div class="h-100vh w-full">
    <AiChart
      :conversation-list="{
        fieldNames: {
          conversationId: 'conversation_id',
          title: 'title',
          createTime: 'created_at',
        },
        request: getConversationList,
        isDelete: true,
        deleteRequest: deleteConversation,
      }"
      :is-conversation-list="true"
      :conversation-detail-request="getConversationDetail"
      :create-conversation-request="createConversation"
      :chart-request="chartRequest"
      :recommends-option="{
        recommends,
        fieldName: {
          groupIconComponent: 'icon',
          groupTitle: 'category',
          groupRecommends: 'prompts',
        },
      }"
      :chart-logo-component="ChartLogo"
      chart-input-layout="horizontal"
    />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
</style>
