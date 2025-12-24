<script setup lang="ts">
import type { ChartItemType, ChartRequestType, conversationDetailRequestType, createConversationRequestType, currentChartType } from './interface'

import { computed, inject, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { AiChartProvideKey, ChartStatusMap, defaultChartContext } from '../../context'
import ChartInput from './chart-input/index.vue'
import ChartRender from './chart-render/index.vue'
import RecommendInput from './recommend-input/index.vue'

const { createConversationRequest, chartRequest, conversationDetailRequest, isInitChartInputCenter = true, markdownCodeRenderConfig, chartLogoComponent, chartInputLayout = 'vertical',
} = defineProps<{
  isInitChartInputCenter?: boolean
  createConversationRequest: createConversationRequestType
  chartRequest: ChartRequestType
  conversationDetailRequest: conversationDetailRequestType
  markdownCodeRenderConfig?: InstanceType<typeof ChartRender>['markdownCodeRenderConfig']
  recommendsOption?: {
    fieldName?: InstanceType<typeof RecommendInput>['fieldName']
    recommends?: InstanceType<typeof RecommendInput>['recommends']
  }
  chartLogoComponent?: any
  chartInputLayout?: InstanceType<typeof ChartInput>['layout']
}>()

const chartContext = inject(AiChartProvideKey, defaultChartContext)

const chartData = ref<ChartItemType[]>([])

const currentChart = reactive<currentChartType>({
  request: undefined,
  response: undefined,
  reason: undefined,
  loading: false,
})

const chartController = shallowRef<AbortController>()
const chartMessage = ref<string>()

function setCurrentResponse(response: string) {
  currentChart.response = response
}

function setCurrentReason(reason: string) {
  currentChart.reason = reason
}

function setResponseLoading(loading: boolean) {
  currentChart.loading = loading
}

function doneFunc() {
  chartContext?.setChartStatus(ChartStatusMap.WAIT)
}

async function chart(message: string) {
  chartController.value = new AbortController()
  const status = chartContext?.chartStatus.value
  let conversationId = chartContext?.conversationId.value
  if (status === ChartStatusMap.FIRST_GENERATE) {
    conversationId = await createConversationRequest()
    chartContext.setConversationId(conversationId)
  }
  if (!conversationId || !message)
    return
  chartMessage.value = ''
  chartRequest({
    conversationId,
    currentRequest: message,
    chartSignal: chartController.value.signal,
    doneFunc,
    setCurrentResponse,
    setCurrentReason,
    setResponseLoading,
  })
}

function resetCurrentChart() {
  currentChart.request = undefined
  currentChart.response = undefined
  currentChart.reason = undefined
  currentChart.loading = false
}

async function getHistoryChart() {
  chartData.value = []
  resetCurrentChart()
  await nextTick()
  const conversationId = chartContext?.conversationId.value
  if (!conversationId)
    return
  const res: ChartItemType[] = await conversationDetailRequest({ conversationId })
  chartData.value = res
  chartContext.setChartStatus(ChartStatusMap.WAIT)
}

async function handleSend(message: string) {
  if (currentChart.request && currentChart.response) {
    chartData.value.push({
      type: 'request',
      content: currentChart.request,
    }, {
      type: 'response',
      reason: currentChart.reason,
      content: currentChart.response,
    })
    resetCurrentChart()
  }

  await nextTick()
  currentChart.request = message
  currentChart.loading = true
  chartContext.setChartStatus(chartContext?.chartStatus.value === ChartStatusMap.INIT ? ChartStatusMap.FIRST_GENERATE : ChartStatusMap.GENERATING)
  chart(message)
}

function handleStop() {
  chartController.value?.abort('用户停止请求')
  chartContext.chartStatus.value = ChartStatusMap.WAIT
}

function handleClickRecommend(message: string) {
  handleSend(message)
}

watch(() => chartContext.chartStatus.value, (val) => {
  if (val === ChartStatusMap.HISTORY) {
    getHistoryChart()
  }
  if (val === ChartStatusMap.INIT) {
    chartData.value = []
    resetCurrentChart()
  }
}, {
  immediate: true,
})

const isInitCenterStatus = computed(() => {
  return isInitChartInputCenter && chartContext.chartStatus.value === ChartStatusMap.INIT
})
</script>

<template>
  <div class="h-full w-full flex justify-center">
    <div class="relative max-w-800px w-100% flex flex-col py-10px">
      <div class="min-h-0 w-full flex-1">
        <ChartRender
          :chart-data="chartData"
          :current-chart="currentChart"
          :create-conversation-request="createConversationRequest"
          :chart-request="chartRequest"
          :conversation-detail-request="conversationDetailRequest"
          :markdown-code-render-config="markdownCodeRenderConfig"
        />
      </div>

      <div
        class="w-full flex flex-col gap-30px"
        :style="{
          transform: isInitCenterStatus ? 'translate3d(0, -23vh, 0)' : 'translate3d(0, 0, 0)',
          transition: 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
        }"
      >
        <div v-if="isInitCenterStatus" class="flex justify-center">
          <component :is="chartLogoComponent" />
        </div>
        <ChartInput
          v-model:message="chartMessage"
          :chart-status="chartContext?.chartStatus.value"
          :layout="chartInputLayout"
          @send="handleSend"
          @stop="handleStop"
        />
        <div v-if="isInitCenterStatus" class="ml--50px w-[calc(100%+100px)]">
          <RecommendInput
            :field-name="recommendsOption?.fieldName"
            :recommends="recommendsOption?.recommends"
            @click-recommend="handleClickRecommend"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
