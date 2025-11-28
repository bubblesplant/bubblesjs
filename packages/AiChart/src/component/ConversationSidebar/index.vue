<script setup lang="ts">
import type { GetConversationListRequest, GroupedConversations } from './conversation-list/interface'

import SvgIcon from '@/components/Icon/svg-icon.vue'

import { AiChartProvideKey, ChartStatusMap, defaultChartContext } from '../../context'
import { formatObjectArrayByTime } from '../../utils'
import ConversationList from './conversation-list/index.vue'

const { sidebarWidth = '20%', conversationList = {
  fieldNames: {
    conversationId: 'id',
    title: 'title',
    createTime: 'create_time',
  },
  request: () => {},
  deleteRequest: () => {},
  isDelete: false,
} } = defineProps<{
  sidebarWidth?: string
  conversationList?: {
    fieldNames?: InstanceType<typeof ConversationList>['fieldNames']
    request?: GetConversationListRequest
    isDelete?: InstanceType<typeof ConversationList>['isDelete']
    deleteRequest?: InstanceType<typeof ConversationList>['deleteRequest']
    isReName?: InstanceType<typeof ConversationList>['isReName']
    renameRequest?: InstanceType<typeof ConversationList>['renameRequest']
  }
}>()

const chartContext = inject(AiChartProvideKey, defaultChartContext)

const conversationListDisabled = computed(() => [ChartStatusMap.GENERATING, ChartStatusMap.FIRST_GENERATE].includes(chartContext.chartStatus.value as any))
function handleNewConversation() {
  if (conversationListDisabled.value) {
    return
  }
  chartContext.conversationId.value = undefined
  chartContext.chartStatus.value = ChartStatusMap.INIT
}

const conversationData = ref<GroupedConversations<any>>()

async function getConversationList() {
  const res: any = await conversationList.request?.()
  const tempRes: GroupedConversations<any> = formatObjectArrayByTime(res, conversationList.fieldNames!.createTime)
  conversationData.value = tempRes
}

onMounted(() => {
  getConversationList()
})

watch(() => chartContext.conversationId.value, async (newVal, oldVal) => {
  if (newVal && !oldVal) {
    getConversationList()
  }
})

const deleteConversation: InstanceType<typeof ConversationList>['deleteRequest'] = async ({ conversationId }) => {
  await conversationList.deleteRequest?.({ conversationId })
  getConversationList()
}

const selectedConversationId = ref<string>()

watch(() => selectedConversationId.value, (newVal) => {
  chartContext.setConversationId(newVal)
  chartContext.setChartStatus(ChartStatusMap.HISTORY)
})
</script>

<template>
  <div class="conversation-sidebar h-full flex flex-col gap-10px bg-#FAFCFFFF" :style="{ width: sidebarWidth }">
    <div />
    <!-- tool bar -->
    <div class="p-[0_16px]">
      <div class="h-36px flex cursor-pointer select-none items-center gap-8px text-14px text-#606266FF hover:bg-[#F5F7FAFF]" :class="{ 'cursor-not-allowed': conversationListDisabled }" @click="handleNewConversation">
        <div class="text-18px">
          <SvgIcon icon="new-chart" />
        </div>
        <div>新建对话</div>
      </div>
    </div>

    <div class="divider" />

    <!-- conversation list -->
    <div class="min-h-0 flex-1 overflow-auto">
      <ConversationList v-model:select="selectedConversationId" :disabled="conversationListDisabled" :field-names="conversationList.fieldNames" :conversation-data="conversationData" :is-delete="conversationList.isDelete" :delete-request="deleteConversation" />
    </div>

    <!-- custom footer slot -->
    <div>
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.divider {
  margin: 0 16px;
  height: 1px;
  background-color: #e4e7ed;
}
</style>
