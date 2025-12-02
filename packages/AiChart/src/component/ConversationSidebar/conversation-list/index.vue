<script setup lang="ts">
import type { ConversationItem, ConversationListFieldNames, DeleteConversationRequest, GroupedConversations, RenameConversationRequest } from './interface'

import { Delete, Edit } from '@element-plus/icons-vue'

import { GroupedConversationsKeyMap } from '../../../utils'

const {
  fieldNames = {
    conversationId: 'id',
    title: 'title',
    createTime: 'create_time',
  },
  conversationData,
  isDelete = false,
  deleteRequest,
  isReName = false,
  renameRequest,
  disabled = false,
} = defineProps<{
  fieldNames?: ConversationListFieldNames
  conversationData?: GroupedConversations<any>
  isDelete?: boolean
  isReName?: boolean
  deleteRequest?: DeleteConversationRequest
  renameRequest?: RenameConversationRequest
  disabled?: boolean
}>()

const editItem = ref<ConversationItem<any>>()

async function handleRename(type: string, editRow: ConversationItem<any>, item: ConversationItem<any>) {
  if (disabled) {
    return
  }
  if (type === 'Enter' || type === 'blur') {
    item.title = editRow.title
    editItem.value = undefined
    await renameRequest?.(item?.[fieldNames.conversationId], item.title)
  }
}

async function handleDelete(conversationId: string) {
  if (disabled) {
    return
  }
  await deleteRequest?.({ conversationId })
}

const selectedConversationId = defineModel<string>('select')

async function handleHistoryConversation(row: ConversationItem<any>) {
  if (disabled) {
    return
  }
  selectedConversationId.value = row?.[fieldNames.conversationId]
}

const conversationDataComputed = computed(() => {
  return Object.entries(conversationData || {}).filter(item => item[0] !== 'other')
})
</script>

<template>
  <div class="conversation-list p-[0_10px]">
    <div class="display flex flex-col gap-10px">
      <div v-for="[key, value] in conversationDataComputed" :key="key" class="flex flex-col gap-5px">
        <div className="mb-10px color-#555 text-13px font-bold text-[000000e6] text-12px">
          {{ GroupedConversationsKeyMap[key as keyof typeof GroupedConversationsKeyMap] }}
        </div>

        <div
          v-for="item of value"
          :key="item?.[fieldNames.conversationId]"
          class="h-38px flex cursor-pointer select-none items-center justify-between gap-10px rounded-12px p-[0_10px] text-14px text-#00000099 hover:bg-[#0000000a]"
          :class="{ 'session-list-content-item-active': item?.[fieldNames.conversationId] === selectedConversationId, 'cursor-not-allowed': disabled }"
        >
          <el-input
            v-if="editItem?.[fieldNames.conversationId] === item?.[fieldNames.conversationId]"
            :model-value="editItem.title"
            @update:model-value="editItem.title = $event "
            @blur="handleRename('blur', editItem, item)"
            @keydown="handleRename(($event as KeyboardEvent).key, editItem, item)"
          />
          <div
            v-else
            class="h-full min-w-0 flex-1 truncate text-14px leading-38px"
            @click="handleHistoryConversation(item)"
          >
            {{ item.title || '新会话' }}
          </div>

          <el-popover
            v-if="isDelete || isReName"
            position="top"
            trigger="click"
          >
            <template #reference>
              <div
                className="flex-center w-24px h-24px rounded-8px cursor-pointer select-none hover:bg-#fff"
              >
                ···
              </div>
            </template>
            <div className="flex flex-col gap-2px">
              <div
                v-if="isReName"
                className="flex items-center gap-8px rounded-8px p-5px text-center cursor-pointer hover:bg-[#f0f0f0]"
                @click="editItem = item"
              >
                <el-icon><Edit /></el-icon> 重命名
              </div>
              <!-- <el-popconfirm
                v-if="isDelete"
                title="确定删除吗？"
                confirm-button-text="确定"
                cancel-button-text="取消"
                @confirm="handleDelete(item?.[fieldNames.conversationId])"
              >
                <template #reference> -->
              <div
                class="flex cursor-pointer items-center gap-8px rounded-8px p-5px text-center color-[#f00] hover:bg-[#f0f0f0]"
                @click="handleDelete(item?.[fieldNames.conversationId])"
              >
                <el-icon><Delete /></el-icon> 删除
              </div>
              <!-- </template>
              </el-popconfirm> -->
            </div>
          </el-popover>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.session-list-content-item-active {
  color: #000000e6;
  background-color: #0000000a;
}
</style>
