<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'
import { RouterLink } from 'vue-router'
import './brand.scss'

withDefaults(
  defineProps<{
    variant?: 'auth' | 'basic' | 'workspace'
    to?: string
    ariaLabel?: string
  }>(),
  { variant: 'workspace' },
)
const { tr } = useI18n()
</script>

<template>
  <component
    :is="to ? RouterLink : 'span'"
    :to="to"
    :aria-label="ariaLabel"
    class="wanwu-brand"
    :class="[`wanwu-brand-${variant}`, { 'wanwu-brand-link': to }]"
  >
    <span class="wanwu-brand-mark" aria-hidden="true" />
    <span class="wanwu-brand-wordmark">
      {{ tr('万物') }}
      <small v-if="variant === 'workspace'" class="wanwu-brand-english">WANWU</small>
    </span>
  </component>
</template>
