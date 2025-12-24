<script setup lang="ts">
const { data, fieldName = {
  groupTitle: 'groupTitle',
  groupRecommends: 'groupRecommends',
  groupIconComponent: 'groupIconComponent',
} } = defineProps<{
  data?: any
  fieldName?: {
    groupIconComponent: any
    groupTitle: string
    groupRecommends: string
  }
}>()

const emits = defineEmits<{
  clickRecommend: [message: string]
}>()
</script>

<template>
  <div
    class="h-168px w-full flex flex-col items-center gap-10px border-1px border-[rgba(242,245,252,1)] border-rd-4px border-solid bg-[rgba(250,252,255,1)] p-16px"
  >
    <div class="flex items-center gap-10px">
      <div class="">
        <component :is="data[fieldName.groupIconComponent]" />
      </div>
      <div class="text-16px text-[rgb(48,49,1)]">
        {{ data[fieldName.groupTitle] }}
      </div>
    </div>
    <div class="flex flex-col gap-10px">
      <div v-for="item in data[fieldName.groupRecommends]" :key="item" class="cursor-pointer text-14px text-[rgb(144,147,153)] hover:underline" @click="emits('clickRecommend', item)">
        “{{ item }}”
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
