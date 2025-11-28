<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  x1?: number
  x2?: number
  y?: number
  height?: number
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: 5,
})

const _x1 = computed(() => {
  const x = (props.x1 ?? 0) < (props.x2 ?? 0) ? (props.x1 ?? 0) : (props.x2 ?? 0)
  return x + (props.height ?? 5) / 2
})

const _x2 = computed(() => {
  const x = (props.x1 ?? 0) < (props.x2 ?? 0) ? (props.x2 ?? 0) : (props.x1 ?? 0)
  return x - (props.height ?? 5) / 2
})
</script>

<template>
  <line
    :x1="_x1"
    :y1="y"
    :x2="_x2"
    :y2="y"
    :stroke="color"
    :stroke-width="height"
    stroke-linecap="round"
  />
</template>
