<script setup lang="ts">
import type { TextLine } from '../utils/Line/LineText'

import { computed, getCurrentInstance, nextTick, watch } from 'vue'

interface Props {
  text: string
  textLine: TextLine
}

const props = defineProps<Props>()

const snippet = computed(() => {
  return props.text.substring(
    props.textLine.startOffset,
    props.textLine.endOffset,
  )
})

const vm = getCurrentInstance()

watch(
  () => props.textLine,
  () => {
    nextTick(() => {
      const el = vm?.proxy?.$el as unknown as { annotatorElement: TextLine }
      if (el) {
        el.annotatorElement = props.textLine
      }
    })
  },
  { immediate: true },
)
</script>

<template>
  <text
    v-if="snippet"
    fill="currentColor"
    class="whitespace-pre"
  >
    {{ snippet }}
  </text>
  <text v-else class="text-xs" fill="currentColor">
    ⮐
  </text>
</template>
