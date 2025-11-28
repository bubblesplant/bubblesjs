<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  fontSize: number
  x1?: number
  x2?: number
  dark?: boolean
  label: string
  labelWidth: number
  level?: number
  openLeft?: boolean
  openRight?: boolean
  rtl?: boolean
  margin?: number
  marker?: string
  maxLevel?: number
  selected?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  dark: false,
  level: 0,
  openLeft: false,
  openRight: false,
  rtl: false,
  margin: 0,
  selected: false,
})

defineEmits<{
  clickRelation: [event: Event]
  contextmenuRelation: []
  mouseover: []
  mouseleave: []
}>()

const r = computed(() => 12)

const y = computed(() => {
  return 20 + props.fontSize * (props.maxLevel ?? 0) + props.fontSize / 2
})

const dy = computed(() => {
  return 20 + props.fontSize * props.level
})

const _x1 = computed(() => {
  return (props.x1 ?? 0) - props.margin
})

const _x2 = computed(() => {
  return (props.x2 ?? 0) - props.margin
})

const center = computed(() => {
  return _x1.value + (_x2.value - _x1.value) / 2
})

const rectX = computed(() => {
  return center.value - props.labelWidth / 2
})

const lineY = computed(() => {
  return y.value - dy.value - r.value
})

const rectY = computed(() => {
  return lineY.value - props.fontSize / 2
})

const textY = computed(() => {
  return lineY.value + props.fontSize / 2 - 3
})

const width = computed(() => {
  return props.selected ? 3 : 1
})

const markerObj = computed(() => {
  if (props.marker === 'start') {
    return { 'marker-start': 'url(#v-annotator-arrow)' }
  }
  else if (props.marker === 'end') {
    return { 'marker-end': 'url(#v-annotator-arrow)' }
  }
  else {
    return {}
  }
})

const fill = computed(() => {
  return props.dark ? '#1E1E1E' : 'white'
})

const d = computed(() => {
  if (props.openLeft && props.openRight) {
    return `M ${_x1.value} ${y.value - dy.value - r.value}
        H ${_x2.value}
        `
  }
  else if (props.openLeft) {
    return `M ${_x1.value} ${y.value - dy.value - r.value}
        H ${_x2.value - r.value}
        A ${r.value} ${r.value} 0 0 1 ${_x2.value} ${lineY.value + r.value}
        v ${dy.value - 3}
        `
  }
  else if (props.openRight) {
    return `M ${_x1.value} ${y.value}
        v -${dy.value}
        A ${r.value} ${r.value} 0 0 1 ${_x1.value + r.value} ${lineY.value}
        H ${_x2.value}
        `
  }
  else {
    return `M ${_x1.value} ${y.value}
        v -${dy.value}
        A ${r.value} ${r.value} 0 0 1 ${_x1.value + r.value} ${lineY.value}
        H ${_x2.value - r.value}
        A ${r.value} ${r.value} 0 0 1 ${_x2.value} ${lineY.value + r.value}
        v ${dy.value - 3}
        `
  }
})
</script>

<template>
  <g
    class="cursor-pointer select-none"
    @click="$emit('clickRelation', $event)"
    @contextmenu="$emit('contextmenuRelation')"
    @mouseover="$emit('mouseover')"
    @mouseleave="$emit('mouseleave')"
  >
    <path
      :d="d"
      v-bind="markerObj"
      stroke="#74b8dc"
      :stroke-width="width"
      fill="none"
    />
    <g v-if="x1">
      <rect
        :x="rectX"
        :y="rectY"
        :width="labelWidth"
        :height="fontSize"
        :fill="fill"
      />
      <text
        :x="center"
        :y="textY"
        fill="currentColor"
        text-anchor="middle"
      >
        {{ label }}
      </text>
    </g>
  </g>
</template>
