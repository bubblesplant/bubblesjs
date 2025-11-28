<script setup lang="ts">
import type { Entity } from './utils/Label/Entity'
import type { Label } from './utils/Label/Label'
import type { Relation, RelationListItem } from './utils/Label/Relation'
import type { TextLine } from './utils/Line/LineText'

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { nanoid } from 'nanoid'
import { debounce } from 'radashi'

import VLine from './components/VLine.vue'
import { TextSelector } from './utils/EventHandler/TextSelectionHandler'
import { Entities } from './utils/Label/Entity'
import {
  EntityLabelListItem,
  LabelList,
  RelationLabelListItem,
} from './utils/Label/Label'
import { RelationList } from './utils/Label/Relation'
import { Text } from './utils/Label/Text'
import { Font } from './utils/Line/Font'
import { TextLineSplitter } from './utils/Line/LineSplitter'
import { widthOf } from './utils/Line/Utils'
import { LineWidthManager } from './utils/Line/WidthManager'

interface ViewLine {
  id: string
  textLine: TextLine
  size: number
}

interface Props {
  maxLabelLength?: number
  text: string
  entities?: Entity[]
  entityLabels?: Label[]
  relations?: Relation[]
  relationLabels?: Label[]
  allowOverlapping?: boolean
  rtl?: boolean
  graphemeMode?: boolean
  dark?: boolean
  selectedEntities?: Entity[]
}

const props = withDefaults(defineProps<Props>(), {
  maxLabelLength: 12,
  entities: () => [],
  entityLabels: () => [],
  relations: () => [],
  relationLabels: () => [],
  allowOverlapping: false,
  rtl: false,
  graphemeMode: true,
  dark: false,
  selectedEntities: () => [],
})

const emit = defineEmits<{
  clickEntity: [event: Event, entityId: number]
  clickRelation: [event: Event, relation: RelationListItem]
  contextmenuEntity: [entity: Entity]
  contextmenuRelation: [relation: RelationListItem]
  addEntity: [event: TouchEvent | MouseEvent, startOffset: number, endOffset: number]
}>()

const uuid = nanoid()
const font = ref<Font | null>(null)
const heights = reactive<{ [id: string]: number }>({})
const maxWidth = ref(-1)
const baseX = ref(0)
const left = ref(0)
const right = ref(0)
const textElement = ref<SVGTextElement | null>(null)
const selectedRelation = ref<RelationListItem | null>(null)
const selectedEntity = ref<Entity | null>(null)

const _text = computed(() => {
  return new Text(props.text)
})

const entityLabelList = computed((): LabelList | null => {
  if (textElement.value) {
    const widths = props.entityLabels.map(label =>
      widthOf(label.text, textElement.value!),
    )
    return LabelList.valueOf(
      props.maxLabelLength,
      props.entityLabels,
      widths,
      EntityLabelListItem,
    )
  }
  else {
    return null
  }
})

const relationLabelList = computed((): LabelList | null => {
  if (textElement.value) {
    const widths = props.relationLabels.map(label =>
      widthOf(label.text, textElement.value!),
    )
    return LabelList.valueOf(
      props.maxLabelLength,
      props.relationLabels,
      widths,
      RelationLabelListItem,
    )
  }
  else {
    return null
  }
})

const textLines = computed((): TextLine[] => {
  if (!font.value || !entityLabelList.value || maxWidth.value === -1) {
    return []
  }
  else {
    const maxLabelWidth = entityLabelList.value.maxLabelWidth
    const calculator = new LineWidthManager(maxWidth.value, maxLabelWidth)
    const splitter = new TextLineSplitter(calculator, font.value)
    return splitter.split(_text.value)
  }
})

const items = computed((): ViewLine[] => {
  if (!textLines.value) {
    return []
  }
  const viewLines: ViewLine[] = []
  for (let i = 0; i < textLines.value.length; i++) {
    const id = `${textLines.value[i].startOffset}:${textLines.value[i].endOffset}`
    viewLines.push({
      id,
      textLine: textLines.value[i],
      size: heights[id] || 64,
    })
  }
  return viewLines
})

const entityList = computed(() => {
  resetSelection()
  if (props.graphemeMode) {
    return Entities.valueOf(props.entities, _text.value)
  }
  else {
    return Entities.valueOf(props.entities)
  }
})

const relationList = computed(() => {
  resetSelection()
  return new RelationList(props.relations, entityList.value)
})

const highlightedEntities = computed((): Entity[] => {
  if (selectedEntity.value) {
    return props.selectedEntities.concat(selectedEntity.value)
  }
  else {
    return props.selectedEntities
  }
})

function clicked(event: Event, entity: Entity) {
  emit('clickEntity', event, entity.id)
}

function onRelationClicked(event: Event, relation: RelationListItem) {
  emit('clickRelation', event, relation)
}

function setMaxWidth() {
  nextTick(
    debounce({
      delay: 500,
    }, () => {
      const containerElement = document.getElementById(
        `container-${uuid}`,
      )!
      maxWidth.value = containerElement.clientWidth
      const rect = containerElement.getBoundingClientRect()
      left.value = rect.left
      right.value = rect.right // - rect.left
      baseX.value = !props.rtl ? 0 : right.value
    }),
  )
}

function updateHeight(id: string, height: number) {
  heights[id] = height
}

function resetSelection() {
  selectedRelation.value = null
  selectedEntity.value = null
}

function open(event: MouseEvent | TouchEvent): void {
  try {
    const selector = new TextSelector(
      props.allowOverlapping,
      props.graphemeMode,
    )

    const [startOffset, endOffset] = selector.getOffsets(
      entityList.value,
      _text.value,
    )
    emit('addEntity', event, startOffset, endOffset)
  }
  catch (_e: any) {
    // Handle error silently 处理选择项没有字的时候
    console.warn('💦', _e)
  }
}

watch(
  () => props.text,
  () => {
    Object.keys(heights).forEach(key => delete heights[key])
    nextTick(() => {
      font.value = Font.create(props.text, textElement.value!)
    })
  },
  { immediate: true },
)

watch(
  () => props.rtl,
  () => {
    setMaxWidth()
  },
)

onMounted(() => {
  textElement.value = document.getElementById(
    `text-${uuid}`,
  ) as unknown as SVGTextElement
  window.addEventListener('resize', setMaxWidth)
  setMaxWidth()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', setMaxWidth)
})
</script>

<template>
  <div :id="`container-${uuid}`" class="h-full w-full overflow-x-visible overflow-y-auto" @click="open" @touchend="open">
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="0" height="0">
      <defs>
        <marker
          id="v-annotator-arrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" stroke="#74b8dc" fill="#74b8dc" />
        </marker>
      </defs>
    </svg>
    <div v-for="(item, index) in items" :key="item.id">
      <VLine
        v-if="entityLabelList && relationLabelList && font"
        :key="`${index}:${rtl}`"
        :annotator-uuid="uuid"
        :dark="dark"
        :entities="
          entityList.filterByRange(
            item.textLine.startOffset,
            item.textLine.endOffset,
          )
        "
        :entity-labels="entityLabelList"
        :relations="
          relationList.filterByRange(
            item.textLine.startOffset,
            item.textLine.endOffset,
          )
        "
        :max-label-length="maxLabelLength"
        :relation-labels="relationLabelList"
        :font="font"
        :rtl="rtl"
        :selected-entities="highlightedEntities"
        :selected-relation="selectedRelation"
        :text="text"
        :text-line="item.textLine"
        :base-x="baseX"
        :left="left"
        :right="right"
        @click-entity="clicked"
        @click-relation="onRelationClicked"
        @contextmenu-entity="emit('contextmenuEntity', $event)"
        @contextmenu-relation="emit('contextmenuRelation', $event)"
        @update:height="updateHeight"
        @set-selected-entity="selectedEntity = $event"
        @set-selected-relation="selectedRelation = $event"
      />
    </div>
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg">
      <text :id="`text-${uuid}`" class="whitespace-pre" />
    </svg>
  </div>
</template>
