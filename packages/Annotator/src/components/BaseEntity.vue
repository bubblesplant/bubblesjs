<script setup lang="ts">
import type { Ranges } from '../utils/Line/LineEntity'

import { computed } from 'vue'

import config from '../utils/Config/Config'
import BaseEntityLine from './BaseEntityLine.vue'
import BaseEntityText from './BaseEntityText.vue'

interface Props {
  ranges: Ranges
  color: string
  noText?: boolean
  label: string
  rtl?: boolean
  margin?: number
  level?: number
  fontSize?: number
  selected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  noText: false,
  rtl: false,
  margin: 0,
  level: 0,
  fontSize: 17,
  selected: false,
})

defineEmits<{
  mouseover: []
  mouseleave: []
  clickEntity: [event: Event]
  contextmenuEntity: []
}>()

const dx = computed(() => {
  return props.rtl ? -config.labelMargin : config.labelMargin
})

const r = computed(() => {
  return config.radius
})

const height = computed(() => {
  return props.selected ? config.lineWidth * 1.5 : config.lineWidth
})

const textX = computed(() => {
  if (props.rtl) {
    return x(props.ranges.first.x2)
  }
  else {
    return x(props.ranges.first.x1)
  }
})

const lineY = computed(() => {
  const marginBottom = 8
  return (
    config.lineWidth
    + (config.lineWidth + props.fontSize + marginBottom) * props.level
  )
})

const textY = computed(() => {
  const marginTop = 5
  return lineY.value + props.fontSize / 2 + marginTop
})

const coordinates = computed((): [number, number][] => {
  return props.ranges.items.map(range => [
    x(range.x1),
    x(range.x2),
  ])
})

function x(xValue: number): number {
  return xValue - props.margin
}
</script>

<template>
  <g @mouseover="$emit('mouseover')" @mouseleave="$emit('mouseleave')">
    <BaseEntityLine
      v-for="([x1, x2], index) in coordinates"
      :key="index"
      :x1="x1"
      :x2="x2"
      :y="lineY"
      :color="color"
      :height="height"
    />
    <BaseEntityText
      v-if="!noText"
      :r="r"
      :x="textX"
      :y="textY"
      :dx="dx"
      :rtl="rtl"
      :text="label"
      :color="color"
      @click-entity="$emit('clickEntity', $event)"
      @contextmenu-entity="$emit('contextmenuEntity')"
    />
  </g>
</template>
