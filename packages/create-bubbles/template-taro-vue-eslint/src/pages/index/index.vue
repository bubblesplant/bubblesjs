<script lang="ts" setup>
import { ref } from 'vue'
import styles from './index.module.scss'

const msg = ref('Hello world')
</script>

<template>
  <div class="index">
    <div :class="styles.red">
      {{ msg }}
    </div>
    <div class="flex-1 text-green">
      222
    </div>
    <nut-button>111</nut-button>
  </div>
</template>
