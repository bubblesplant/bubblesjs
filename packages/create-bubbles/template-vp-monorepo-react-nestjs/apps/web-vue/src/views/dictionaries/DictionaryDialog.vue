<script setup lang="ts">
import type { SchemaFormColumn, SchemaFormInstance } from '@bubblesjs/antdv-next-pro'
import type { CreateDictionaryRequest, DictionaryRecord } from 'shared/types'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Button, Input, InputNumber, Modal, Select, Space } from 'antdv-next'
import { createDictionarySchema, DICTIONARY_MAX_ITEMS } from 'shared/utils'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  record?: DictionaryRecord
  save: (body: CreateDictionaryRequest) => Promise<boolean>
}>()
const open = defineModel<boolean>('open', { default: false })
const { tr } = useI18n()
const model = ref<Record<string, unknown>>({})
const items = ref<CreateDictionaryRequest['items']>([])
const saving = ref(false)
const error = ref('')
const form = ref<SchemaFormInstance>()
const statuses = computed(() => [
  {
    label: tr('启用'),
    value: 'active',
  },
  {
    label: tr('停用'),
    value: 'disabled',
  },
])
const columns = computed<SchemaFormColumn[]>(() => [
  {
    title: tr('字典名称'),
    dataIndex: 'name',
    formItemProps: {
      rules: [{ required: true, whitespace: true, max: 100 }],
    },
  },
  {
    title: tr('字典编码'),
    dataIndex: 'code',
    fieldProps: { disabled: !!props.record, maxLength: 64 },
    formItemProps: {
      rules: [
        {
          required: true,
          pattern: /^[a-z][a-z0-9_]*$/,
          message: tr('以小写字母开头，仅包含小写字母、数字和下划线'),
        },
      ],
    },
  },
  {
    title: tr('说明'),
    dataIndex: 'description',
    valueType: 'textarea',
    fieldProps: { maxLength: 500, rows: 2 },
  },
  {
    title: tr('状态'),
    dataIndex: 'status',
    valueType: 'select',
    fieldProps: { options: statuses.value },
  },
])
watch(open, (value) => {
  if (!value) return
  model.value = props.record
    ? {
        name: props.record.name,
        code: props.record.code,
        description: props.record.description,
        status: props.record.status,
      }
    : { status: 'active', description: '' }
  items.value = props.record?.items.map((item) => ({ ...item })) ?? []
  error.value = ''
})
/** 历史值不可改删；新增行可移除，停用代替删除已有业务值。 */
function persisted(value: string) {
  return !!props.record?.items.some((item) => item.value === value)
}
/** 用前后端同一份规则验证完整内容，失败时保留编辑。 */
async function submit() {
  if (saving.value) return
  try {
    const values = await form.value!.validate()
    const result = createDictionarySchema.safeParse({ ...values, items: items.value })
    if (!result.success) {
      error.value = result.error.issues
        .map((issue) => `${issue.path.join('.')}：${issue.message}`)
        .join('；')
      return
    }
    saving.value = true
    error.value = ''
    if (await props.save(result.data)) open.value = false
  } catch {
    /* 字段校验由 SchemaForm 显示。 */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="tr(record ? '编辑数据字典' : '新增数据字典')"
    :width="900"
    :confirm-loading="saving"
    :mask-closable="false"
    destroy-on-hidden
    :ok-text="tr('保存')"
    :cancel-text="tr('取消')"
    @ok="submit"
    @cancel="!saving && (open = false)"
  >
    <SchemaForm
      v-if="open"
      ref="form"
      v-model="model"
      :columns="columns"
      :submitter="false"
      layout="vertical"
    />
    <Alert type="info" show-icon :title="tr('已保存的业务值不能修改或删除，不再使用时请停用。')" />
    <div class="editor-scroll">
      <table class="editor-table">
        <thead>
          <tr>
            <th>{{ tr('业务值') }}</th>
            <th>{{ tr('显示名称') }}</th>
            <th>{{ tr('排序') }}</th>
            <th>{{ tr('状态') }}</th>
            <th>{{ tr('操作') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in items" :key="index">
            <td>
              <Input
                v-model:value="item.value"
                :disabled="index < (record?.items.length ?? 0)"
                :maxlength="100"
              />
            </td>
            <td><Input v-model:value="item.label" :maxlength="100" /></td>
            <td><InputNumber v-model:value="item.sort" :min="0" :max="999999" :precision="0" /></td>
            <td><Select v-model:value="item.status" :options="statuses" style="width: 90px" /></td>
            <td>
              <Button
                danger
                type="link"
                :disabled="index < (record?.items.length ?? 0) || persisted(item.value)"
                @click="items.splice(index, 1)"
              >
                {{ tr('删除') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Space style="margin-top: 12px">
      <Button
        :disabled="items.length >= DICTIONARY_MAX_ITEMS"
        @click="items.push({ value: '', label: '', sort: items.length, status: 'active' })"
      >
        ＋ {{ tr('新增选项') }}
      </Button>
      <span class="muted">{{ items.length }} / {{ DICTIONARY_MAX_ITEMS }}</span>
    </Space>
    <Alert v-if="error" style="margin-top: 12px" type="error" :title="error" show-icon />
  </Modal>
</template>
