<script setup lang="ts">
import { ref } from 'vue'

import AiMarkdownRender from '../../../../AiMarkdown/index.vue'
import SvgIcon from '../../../../Icon/svg-icon.vue'

const { reason } = defineProps<{
  reason: string
}>()

const collapse = ref<boolean>(true)

function handleCollapse() {
  collapse.value = !collapse.value
}
</script>

<template>
  <div class="flex flex-col">
    <!-- 折叠按钮 -->
    <div class="w-[fit-content] flex cursor-pointer select-none items-center justify-between gap-20px border-rd-8px bg-[#0000000a] p-[8px_16px]" @click="handleCollapse">
      <div class="flex-center gap-5px">
        <SvgIcon icon="thinking" />
        <div>深度思考</div>
      </div>
      <SvgIcon icon="arrow-down" :style="{ transform: `rotate(${collapse ? 0 : 180}deg)` }" />
    </div>
    <!-- 思考内容 -->
    <div
      class="[transition:grid-template-rows_0.3s_ease-in-out] grid mt-5px w-full overflow-hidden" :style="{
        gridTemplateRows: collapse ? '0fr' : '1fr',
      }"
    >
      <div class="min-h-0 border-width-[0px_0px_0px_1px] border-[#00000026] border-solid p-l-10px text-13px color-#999">
        <p>深度思考</p>
        <br>
        <AiMarkdownRender :markdown="reason" class="text-#999" />
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.md-editor.ai-markdown-preview *) {
  color: #999;
}
</style>
