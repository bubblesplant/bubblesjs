<script setup lang="ts">
import type { ChartItemType, currentChartType } from '../interface'
import { nextTick, useTemplateRef, watch } from 'vue'
import { contentTypeMap } from './config'
import { useScroll } from './hooks/useScroll'
import Loading from './render/loading/index.vue'
import RequestRender from './render/request/index.vue'
import ResponseRender from './render/response/index.vue'
import ResponseReasonRender from './render/response/reason.vue'

const { chartData, currentChart, markdownCodeRenderConfig } = defineProps<{
  chartData: ChartItemType[]
  currentChart: currentChartType
  markdownCodeRenderConfig?: InstanceType<typeof ResponseRender>['markdownCodeRenderConfig']
}>()

const chartContainer = useTemplateRef('chartContainer')
const chartWrapper = useTemplateRef('chartWrapper')
const { scrollBottom } = useScroll(chartContainer, chartWrapper)

watch(() => chartData, async () => {
  await nextTick()
  scrollBottom()
})
</script>

<template>
  <div ref="chartContainer" class="chart-container h-full w-full overflow-y-auto">
    <div ref="chartWrapper" class="chart-wrapper w-full">
      <template v-for="(item, index) in chartData" :key="index">
        <RequestRender v-if="item.type === contentTypeMap.request" :content="item.content" />
        <div v-else-if="item.type === contentTypeMap.response" class="mt-10px">
          <ResponseReasonRender v-if="item.reason" :reason="item.reason" />
          <ResponseRender v-if="item.content" :content="item.content" :markdown-code-render-config="markdownCodeRenderConfig" />
        </div>
      </template>

      <RequestRender v-if="currentChart.request" :content="currentChart.request" />
      <div v-if="currentChart.loading" class="m-[10px_0_0_10px] h-40px overflow-hidden">
        <Loading />
      </div>
      <div v-else class="mt-10px">
        <ResponseReasonRender v-if="currentChart.reason" :reason="currentChart.reason" />
        <ResponseRender v-if="currentChart.response" :content="currentChart.response" :markdown-code-render-config="markdownCodeRenderConfig" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
