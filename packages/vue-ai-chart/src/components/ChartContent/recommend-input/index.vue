<script setup lang="ts">
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'
import { Navigation } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/vue'

import { computed, useTemplateRef } from 'vue'

import RecommendItem from './recommend-item.vue'
import 'swiper/swiper.css'

const { recommends, fieldName } = defineProps<{
  recommends?: InstanceType<typeof RecommendItem>['data'][]
  fieldName?: InstanceType<typeof RecommendItem>['fieldName']
}>()

const emits = defineEmits<{
  clickRecommend: [message: string]
}>()
const swiperButtonPrev = useTemplateRef('swiperButtonPrev')
const swiperButtonNext = useTemplateRef('swiperButtonNext')

function handleClickRecommend(message: string) {
  emits('clickRecommend', message)
}

const SLIDES_PER_VIEW = 4

const isNavigation = computed(() => {
  return (recommends || []).length > SLIDES_PER_VIEW
})
</script>

<template>
  <div class="flex flex-col items-center gap-12px">
    <div class="recommends-title text-14px text-[rgb(192,196,204)]">
      试试这些
    </div>
    <div v-if="(recommends || []).length > 0" class="w-full flex">
      <div v-if="isNavigation" ref="swiperButtonPrev" class="swiper-navigation">
        <el-icon><ArrowLeft /></el-icon>
      </div>
      <div class="min-w-0 flex-1">
        <Swiper
          :slides-per-view="SLIDES_PER_VIEW" :space-between="10" :pagination="false" :navigation="isNavigation ? {
            prevEl: swiperButtonPrev,
            nextEl: swiperButtonNext,
          } : false" :modules="[Navigation]"
        >
          <SwiperSlide v-for="(item, index) in recommends" :key="index">
            <RecommendItem :data="item" :field-name="fieldName" @click-recommend="handleClickRecommend" />
          </SwiperSlide>
        </Swiper>
      </div>
      <div v-if="isNavigation" ref="swiperButtonNext" class="swiper-navigation">
        <el-icon><ArrowRight /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped>
.swiper-navigation {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  font-size: 25px;
  color: #000;
  cursor: pointer;
}

.recommends-title {
  display: flex;
  align-items: center;
}

.recommends-title::before,
.recommends-title::after {
  content: ' ';
  margin: 0 8px;
  width: 120px;
  height: 1px;
}

.recommends-title::before {
  background: linear-gradient(to right, rgba(192, 196, 204, 0), rgba(192, 196, 204, 1));
}

.recommends-title::after {
  background: linear-gradient(to right, rgba(192, 196, 204, 1), rgba(192, 196, 204, 0));
}
</style>
