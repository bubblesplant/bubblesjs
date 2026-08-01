<script setup lang="ts">
defineProps<{
  icon: string
}>()
const attrs = useAttrs()
</script>

<template>
  <svg class="svg-icon" aria-hidden="true" v-bind="attrs">
    <use :href="`#icon-${icon}`" />
  </svg>
</template>

<style lang="scss" scoped>
.svg-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 1em;
  height: 1em;
  fill: currentColor;
  overflow: hidden;
}

.svg-external-icon {
  background-color: currentColor;
  mask-size: cover !important;
}
</style>
