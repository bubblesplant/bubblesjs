<script setup lang="ts">
import type { ChartStatusType, conversationIdType, setChartStatusType, setConversationIdType } from './context'

import ChartContent from './component/ChartContent/index.vue'
import ConversationSidebar from './component/ConversationSidebar/index.vue'
import { AiChartProvideKey, ChartStatusMap } from './context'

const { sidebarWidth, isConversationList, isInitChartInputCenter = true, markdownCodeRenderConfig, chartLogoComponent, chartInputLayout } = defineProps<{
  isInitChartInputCenter?: boolean
  isConversationList?: boolean
  sidebarWidth?: string
  conversationList?: InstanceType<typeof ConversationSidebar>['conversationList']
  markdownCodeRenderConfig?: InstanceType<typeof ChartContent>['markdownCodeRenderConfig']
  createConversationRequest: InstanceType<typeof ChartContent>['createConversationRequest']
  chartRequest: InstanceType<typeof ChartContent>['chartRequest']
  conversationDetailRequest: InstanceType<typeof ChartContent>['conversationDetailRequest']
  recommendsOption?: InstanceType<typeof ChartContent>['recommendsOption']
  chartLogoComponent?: InstanceType<typeof ChartContent>['chartLogoComponent']
  chartInputLayout?: InstanceType<typeof ChartContent>['chartInputLayout']
}>()

const conversationId = ref<conversationIdType>()

const setConversationId: setConversationIdType = (id) => {
  conversationId.value = id
}

const chartStatus = ref<ChartStatusType>(ChartStatusMap.INIT)

const setChartStatus: setChartStatusType = (status) => {
  chartStatus.value = status
}

provide(AiChartProvideKey, {
  conversationId,
  setConversationId,
  chartStatus,
  setChartStatus,
})

const slots = useSlots()
const SIDEBAR_SLOT_AFFIX = 'sidebar'

const sidebarSlot = computed(() => {
  const result: string[] = []
  for (const item in slots) {
    if (item.startsWith(SIDEBAR_SLOT_AFFIX)) {
      result.push(item.replace(`${SIDEBAR_SLOT_AFFIX}-`, ''))
    }
  }
  return result
})
</script>

<template>
  <div class="h-full w-full flex">
    <ConversationSidebar
      v-if="isConversationList && conversationList"
      :chart-logo-component="chartLogoComponent"
      :sidebar-width="sidebarWidth" :conversation-list="conversationList"
    >
      <template v-for="item in sidebarSlot" :key="item" #[item]="slotProps">
        <slot :name="`${SIDEBAR_SLOT_AFFIX}-${item}`" v-bind="slotProps" />
      </template>
    </ConversationSidebar>
    <div class="min-w-0 flex-1 bg-#fff">
      <ChartContent
        :recommends-option="recommendsOption"
        :is-init-chart-input-center="isInitChartInputCenter"
        :create-conversation-request="createConversationRequest"
        :chart-request="chartRequest"
        :conversation-detail-request="conversationDetailRequest"
        :markdown-code-render-config="markdownCodeRenderConfig"
        :chart-logo-component="chartLogoComponent"
        :chart-input-layout="chartInputLayout"
      />
    </div>
  </div>
</template>
