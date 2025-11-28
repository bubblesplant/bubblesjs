<script lang="ts" setup>
import { nextTick, ref, useSlots, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{ animationTime?: number }>(), {
  animationTime: 15,
})

const warper = useTemplateRef('warper')
const childDom1 = useTemplateRef('childDom1')
const childDom2 = useTemplateRef('childDom2')
const animationPlayState = ref('paused')

function scroll() {
  if (!warper.value || !childDom1.value || !childDom2.value) {
    return
  }
  const warperHeight = warper?.value?.offsetHeight ?? 0
  const scrollHeight = childDom1?.value?.offsetHeight ?? 0

  if (scrollHeight > warperHeight) {
    childDom2.value.innerHTML = childDom1?.value.innerHTML
    animationPlayState.value = 'running'
  } else {
    animationPlayState.value = 'paused'
  }
}
const slots = useSlots()
watch(
  () => slots.default?.()?.[0]?.children,
  async (val) => {
    if (((val || []) as any[]).length > 0) {
      await nextTick()
      scroll()
    }
  },
)
</script>

<template>
  <div
    ref="warper"
    class="parent"
    :style="{
      '--animation-second': `${props.animationTime}s`,
      '--animation-play-state': animationPlayState,
    }"
  >
    <div class="warper">
      <div ref="childDom1" class="child">
        <slot />
      </div>
      <div ref="childDom2" className="child" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.parent {
  width: 100%;
  height: 100%;
  /* // overflow-y: scroll; */
  scrollbar-width: none;
  -ms-overflow-style: none;
  overflow: hidden;
}
.parent::-webkit-scrollbar {
  display: none;
}

.warper {
  animation: infiniteScroll infinite var(--animation-second) linear;
  animation-play-state: var(--animation-play-state);
}

.warper:hover {
  animation-play-state: paused;
}

@keyframes infiniteScroll {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-50%);
  }
}
</style>
