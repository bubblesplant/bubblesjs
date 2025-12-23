<script setup lang="ts">
import type { ChartStatusType } from '../../../context'
import { computed } from 'vue'

import { ChartStatusMap } from '../../../context'

import SvgIcon from '../../Icon/svg-icon.vue'

const { chartStatus, layout = 'vertical' } = defineProps<{
  chartStatus: ChartStatusType
  layout?: 'vertical' | 'horizontal'
}>()

const emits = defineEmits<{
  send: [message: string]
  stop: []
}>()

const chartMessage = defineModel<string>('message')

const isSend = computed(() => [ChartStatusMap.INIT, ChartStatusMap.WAIT, ChartStatusMap.HISTORY].includes(chartStatus as any))

function handleSend() {
  if (isSend.value) {
    if (!chartMessage.value)
      return
    emits('send', chartMessage.value)
    return
  }
  emits('stop')
}
</script>

<template>
  <div>
    <!-- vertical layout -->
    <div v-if="layout === 'vertical'" class="chart-input relative max-h-250px flex flex-col gap-3px border-1px border-[#0000000f] rounded-16px border-solid bg-[#fff] p-16px">
      <textarea
        v-model="chartMessage"
        placeholder="给AI助手发送消息"
        class="absolute bottom-60px left-15px right-15px top-15px min-h-56px w-[calc(100%-30px)] resize-none overflow-auto border-none text-16px text-#404040 leading-24px outline-none"
        @keydown.enter="handleSend"
      />
      <div class="pointer-events-none invisible min-h-56px overflow-auto whitespace-pre-wrap break-words text-16px text-[#404040] leading-24px">
        {{ chartMessage }}
      </div>
      <div class="mt-10px flex justify-between">
        <!-- 对话框左边工具栏 -->
        <div class="flex gap-15px" />
        <!-- 对话框右边工具栏 -->
        <div class="flex">
          <div class="relative h-32px w-32px flex-center cursor-pointer select-none rounded-50% bg-#000" @click="handleSend">
            <SvgIcon :icon="isSend ? 'send' : 'stop'" />

            <div v-if="!isSend" class="rotate absolute h-95% w-95% border-4px border-[#fff_transparent_transparent_transparent] rounded-50% border-solid" />
          </div>
        </div>
      </div>
    </div>

    <!-- horizontal layout -->
    <div v-else class="chart-input relative flex items-center gap-3px border-1px border-[#0000000f] rounded-16px border-solid bg-[#fff] p-16px">
      <div class="relative min-w-0 flex-1 overflow-y-auto">
        <textarea
          v-model="chartMessage"
          placeholder="询问任何问题，shift+enter换行"
          class="absolute bottom-0 left-0 right-0 top-0 max-h-150px min-h-25px w-[calc(100%-30px)] resize-none overflow-auto border-none text-16px text-#404040 leading-24px outline-none"
          @keydown.enter="handleSend"
        />
        <div class="pointer-events-none invisible max-h-150px min-h-25px overflow-auto whitespace-pre-wrap break-words text-16px text-[#404040] leading-24px">
          {{ chartMessage }}
        </div>
      </div>
      <div class="h-full flex flex-shrink-0 gap-10px">
        <!-- 对话框左边工具栏 -->
        <div class="flex gap-10px" />
        <!-- 对话框右边工具栏 -->
        <div class="h-full flex items-center">
          <div class="relative h-32px w-32px flex-center cursor-pointer select-none rounded-50% bg-#000" @click="handleSend">
            <SvgIcon :icon="isSend ? 'send' : 'stop'" />

            <div v-if="!isSend" class="rotate absolute h-95% w-95% border-4px border-[#fff_transparent_transparent_transparent] rounded-50% border-solid" />
          </div>
        </div>
      </div>
    </div>
    <div class="mt-8px w-full flex-center text-12px text-[#A8ABB2FF]">
      所有内容均由AI生成，仅供参考
    </div>
  </div>
</template>

<style scoped>
.chart-input {
  box-shadow: 0px 4px 16px #0000000f;
}

.rotate {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
