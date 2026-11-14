<script setup lang="ts">
import type { SchemaFormColumn, SchemaFormInstance } from '@bubblesjs/antdv-next-pro'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Modal } from 'antdv-next'
import { computed, ref, useId, watch } from 'vue'

const props = defineProps<{
  title: string
  columns: SchemaFormColumn[]
  initial?: Record<string, unknown>
  save: (values: Record<string, unknown>) => Promise<boolean>
  width?: number
}>()
const open = defineModel<boolean>('open', { default: false })
const form = ref<SchemaFormInstance>()
const formName = `schema-dialog-${useId()}`
const model = ref<Record<string, unknown>>({})
const saving = ref(false)
const { tr } = useI18n()
const translatedColumns = computed(() =>
  props.columns.map((column) => ({
    ...column,
    title: typeof column.title === 'string' ? tr(column.title) : column.title,
    formItemProps:
      column.formItemProps && typeof column.formItemProps === 'object'
        ? {
            ...column.formItemProps,
            rules: Array.isArray(column.formItemProps.rules)
              ? column.formItemProps.rules.map((rule) => ({
                  ...rule,
                  message: typeof rule.message === 'string' ? tr(rule.message) : rule.message,
                }))
              : column.formItemProps.rules,
          }
        : column.formItemProps,
  })),
)
watch(open, (value) => {
  if (value) model.value = { ...props.initial }
  else model.value = {}
})
/** 校验后提交，失败保留弹窗和表单。 */
async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    const values = await form.value!.validate()
    if (await props.save(values)) open.value = false
  } catch {
    /* 字段校验由表单就地展示。 */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :width="width ?? 560"
    :confirm-loading="saving"
    :ok-text="tr('保存')"
    :cancel-text="tr('取消')"
    :mask-closable="false"
    destroy-on-hidden
    @ok="submit"
    @cancel="!saving && (open = false)"
  >
    <SchemaForm
      v-if="open"
      ref="form"
      v-model="model"
      :form-props="{ name: formName }"
      :columns="translatedColumns"
      :submitter="false"
      layout="vertical"
    />
    <slot :model="model" />
  </Modal>
</template>
