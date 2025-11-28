<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  r: number
  x: number
  y: number
  dx: number
  color: string
  text: string
  rtl?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  rtl: false,
})

const emit = defineEmits<{
  clickEntity: [event: Event]
  contextmenuEntity: []
}>()

const cx = computed(() => {
  return props.rtl ? props.x - props.r : props.x + props.r
})
</script>

<template>
  <g
    class="cursor-pointer select-none"
    @click="emit('clickEntity', $event)"
    @contextmenu.prevent="emit('contextmenuEntity')"
  >
    <circle :r="r" :fill="color" :cx="cx" :cy="y" />
    <text
      :x="x"
      :y="y"
      fill="currentColor"
      :dx="dx"
      dy="0.35em"
    >
      {{ text }}
    </text>
  </g>
</template>
