<script setup lang="ts">
import type { DictionaryOption, DictionaryReference } from 'shared/types'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Button, Select } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { ref, watch } from 'vue'
import { dictionaryCache } from '@/store/dictionary'

const props = defineProps<DictionaryReference & { disabled?: boolean; multiple?: boolean }>()
const value = defineModel<string | string[]>()
const options = ref<DictionaryOption[]>([])
const loading = ref(false)
const error = ref('')
const retry = ref(0)
const { tr } = useI18n()
watch(
  [() => props.scope, () => props.code, dictionaryCache.revision, retry],
  async (_, __, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    options.value = []
    error.value = ''
    loading.value = true
    if (!props.code) {
      loading.value = false
      return
    }
    try {
      const result = await dictionaryCache.load({ scope: props.scope, code: props.code })
      if (current) options.value = result
    } catch (cause) {
      if (current && (cause as Error).name !== 'AbortError')
        error.value = getRequestErrorMessage(cause, tr('选项加载失败'))
    } finally {
      if (current) loading.value = false
    }
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <Select
    v-model:value="value"
    style="width: 100%"
    :options="options"
    :loading="loading"
    :disabled="disabled || !!error"
    :mode="multiple ? 'multiple' : undefined"
    allow-clear
    show-search
    option-filter-prop="label"
    :placeholder="tr('请选择')"
  />
  <Alert v-if="error" type="error" :title="error" show-icon>
    <template #action>
      <Button size="small" @click="retry++">
        {{ tr('重试') }}
      </Button>
    </template>
  </Alert>
</template>
