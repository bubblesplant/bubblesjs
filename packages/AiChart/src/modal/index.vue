<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const { title = 'Ai助手' } = defineProps<{
  title: string
}>()

const aiModelRef = useTemplateRef('aiModelRef')

onClickOutside(aiModelRef, hide)

const open = ref(false)

// function show() {
//   open.value = true
// }

function hide() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <div ref="aiModelRef" class="fixed bottom-10vh right-0 z-10000">
    <!-- 弹窗 -->
    <div v-if="open" class="modal absolute bottom-50px right-3px box-border h-619px w-480px flex flex-col border-1px border-[#dcdfe6ff] border-rd-8px border-solid bg-[#fff]">
      <div class="h-46px w-full flex flex-shrink-0 items-center justify-between px-12px">
        <div class="text-14px font-bold">
          {{ title }}
        </div>
        <div class="h-14px w-14px flex-center cursor-pointer rounded-50% bg-[#909399FF]" @click="hide">
          <span class="flex-center scale-70 text-12px text-#fff">
            X
          </span>
        </div>
      </div>
      <div class="min-h-0 flex-1 p-[0_12px]">
        <slot name="chart" />
      </div>
    </div>
    <!-- 头像 -->
    <div @click.stop="toggle">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal {
  box-shadow:
    0px 5px 5px -3px #0000001a,
    0px 8px 10px 1px #0000000f,
    0px 3px 14px 2px #0000000d;
}
</style>
