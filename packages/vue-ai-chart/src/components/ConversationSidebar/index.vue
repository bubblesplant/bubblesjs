<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'

import { ElTooltip } from 'element-plus'
import { AiChartProvideKey, ChartStatusMap, defaultChartContext } from '../../context'
import { formatObjectArrayByTime } from '../../utils'
import SvgIcon from '../Icon/svg-icon.vue'
import ConversationList from './conversation-list/index.vue'
import type {
  GetConversationListRequest,
  GroupedConversations,
} from './conversation-list/interface'

const {
  sidebarWidth = '20%',
  conversationList = {
    fieldNames: {
      conversationId: 'id',
      title: 'title',
      createTime: 'create_time',
    },
    request: () => {},
    deleteRequest: () => {},
    isDelete: false,
    chartLogoComponent: null,
  },
} = defineProps<{
  sidebarWidth?: string
  conversationList?: {
    fieldNames?: InstanceType<typeof ConversationList>['fieldNames']
    request?: GetConversationListRequest
    isDelete?: InstanceType<typeof ConversationList>['isDelete']
    deleteRequest?: InstanceType<typeof ConversationList>['deleteRequest']
    isReName?: InstanceType<typeof ConversationList>['isReName']
    renameRequest?: InstanceType<typeof ConversationList>['renameRequest']
  }
  chartLogoComponent?: any
}>()

const chartContext = inject(AiChartProvideKey, defaultChartContext)

const conversationListDisabled = computed(() =>
  [ChartStatusMap.GENERATING, ChartStatusMap.FIRST_GENERATE].includes(
    chartContext.chartStatus.value as any,
  ),
)
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
  const tempRes: GroupedConversations<any> = formatObjectArrayByTime(
    res,
    conversationList.fieldNames!.createTime,
  )
  conversationData.value = tempRes
}

onMounted(() => {
  getConversationList()
})

watch(
  () => chartContext.conversationId.value,
  async (newVal, oldVal) => {
    if (newVal && !oldVal) {
      getConversationList()
    }
  },
)

const deleteConversation: InstanceType<typeof ConversationList>['deleteRequest'] = async ({
  conversationId,
}) => {
  await conversationList.deleteRequest?.({ conversationId })
  getConversationList()
}

const selectedConversationId = ref<string>()

watch(
  () => selectedConversationId.value,
  (newVal) => {
    chartContext.setConversationId(newVal)
    chartContext.setChartStatus(ChartStatusMap.HISTORY)
  },
)

const isCollapsed = ref<boolean>(false)

function handleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

const sidebarWidthComputed = computed(() => (isCollapsed.value ? '64px' : sidebarWidth))
</script>

<template>
  <div class="conversation-sidebar h-full flex flex-col gap-10px overflow-hidden bg-#FAFCFFFF p-[12px_13px] transition-width duration-300" :style="{ width: sidebarWidthComputed }">
    <div class="h-36px w-36px flex cursor-pointer select-none items-center gap-8px overflow-hidden text-14px text-#606266FF hover:bg-[#F5F7FAFF]" :class="{ 'cursor-not-allowed': conversationListDisabled }">
      <el-tooltip placement="right" :content="isCollapsed ? '展开' : '收起'">
        <div class="h-38px w-38px flex-center rounded-[8px] text-26px hover:bg-[#E8E8E8]" @click="handleCollapse">
          <SvgIcon icon="collapse" />
        </div>
      </el-tooltip>

      <!-- <div class="h-full min-w-0 flex-1 text-nowrap">
        <component :is="chartLogoComponent" />
      </div> -->
    </div>
    <!-- tool bar -->
    <div class="h-36px flex cursor-pointer select-none items-center gap-8px overflow-hidden text-14px text-#606266FF hover:bg-[#F5F7FAFF]" :class="{ 'cursor-not-allowed': conversationListDisabled }" @click="handleNewConversation">
      <el-tooltip placement="right" content="新建对话">
        <div class="h-38px w-38px flex-center flex-shrink-0 text-20px">
          <SvgIcon icon="new-chart" />
        </div>
      </el-tooltip>
      <div class="min-w-0 flex-1 text-nowrap">
        新建对话
      </div>
    </div>

    <div v-show="!isCollapsed" class="divider" />

    <!-- conversation list -->
    <div v-show="!isCollapsed" class="min-h-0 flex-1 overflow-auto">
      <ConversationList v-model:select="selectedConversationId" :disabled="conversationListDisabled" :field-names="conversationList.fieldNames" :conversation-data="conversationData" :is-delete="conversationList.isDelete" :delete-request="deleteConversation" />
    </div>

    <!-- custom footer slot -->
    <div>
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.divider {
  height: 1px;
  background-color: #e4e7ed;
}
</style>
