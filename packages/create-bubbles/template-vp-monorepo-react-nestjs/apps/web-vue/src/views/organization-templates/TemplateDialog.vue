<script setup lang="ts">
import type { SchemaFormColumn, SchemaFormInstance } from '@bubblesjs/antdv-next-pro'
import type { CreateOrganizationTemplateRequest, OrganizationTemplateRecord } from 'shared/types'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Select, Tabs } from 'antdv-next'
import { createOrganizationTemplateSchema } from 'shared/utils'
import { computed, ref, useId, watch } from 'vue'

const props = defineProps<{
  record?: OrganizationTemplateRecord
  save: (body: CreateOrganizationTemplateRequest) => Promise<boolean>
}>()
const open = defineModel<boolean>('open', { default: false })
const { tr } = useI18n()
const form = ref<SchemaFormInstance>()
const formName = `template-editor-${useId()}`
const model = ref<Record<string, unknown>>({})
const isDefault = ref(false)
const units = ref<CreateOrganizationTemplateRequest['units']>([])
const positions = ref<CreateOrganizationTemplateRequest['positions']>([])
const saving = ref(false)
const error = ref('')
const tab = ref('units')
/** 新增具有稳定临时键的组织定义，供父子关系引用。 */
function addUnit() {
  units.value.push({
    clientKey: crypto.randomUUID(),
    parentClientKey: null,
    name: '',
    code: '',
    description: '',
    sort: units.value.length,
  })
}
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
    title: tr('模板名称'),
    dataIndex: 'name',
    fieldProps: { maxLength: 100 },
    formItemProps: {
      rules: [
        {
          required: true,
          whitespace: true,
          min: 2,
          max: 100,
        },
      ],
    },
  },
  {
    title: tr('模板说明'),
    dataIndex: 'description',
    valueType: 'textarea',
    fieldProps: { maxLength: 500, rows: 2 },
  },
])
watch(open, (value) => {
  if (!value) return
  model.value = { name: props.record?.name ?? '', description: props.record?.description ?? '' }
  isDefault.value = props.record?.isDefault ?? false
  units.value =
    props.record?.units.map((unit) => ({
      clientKey: unit.id,
      parentClientKey: unit.parentId,
      name: unit.name,
      code: unit.code,
      description: unit.description,
      sort: unit.sort,
    })) ?? []
  positions.value =
    props.record?.positions.map((position) => ({
      name: position.name,
      code: position.code,
      description: position.description,
      status: position.status,
    })) ?? []
  error.value = ''
  tab.value = 'units'
})
/** 排除自身及后代，父级选择不会形成循环。 */
function parentOptions(key: string) {
  const excluded = new Set([key])
  let changed = true
  while (changed) {
    changed = false
    for (const unit of units.value) {
      if (
        unit.parentClientKey &&
        excluded.has(unit.parentClientKey) &&
        !excluded.has(unit.clientKey)
      ) {
        excluded.add(unit.clientKey)
        changed = true
      }
    }
  }
  return [
    {
      value: '',
      label: tr('顶级组织'),
    },
    ...units.value
      .filter((unit) => !excluded.has(unit.clientKey))
      .map((unit, index) => ({
        value: unit.clientKey,
        label: unit.name || `${tr('组织')} ${index + 1}`,
      })),
  ]
}
/** 删除定义时将直接下级提升至原上级，保留其他已编辑内容。 */
function removeUnit(index: number) {
  const removed = units.value[index]!
  for (const unit of units.value) {
    if (unit.parentClientKey === removed.clientKey) unit.parentClientKey = removed.parentClientKey
  }
  units.value.splice(index, 1)
}
/** 校验整份定义后保存；服务端继续校验层级上限、重复编码和名称。 */
async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    const values = await form.value!.validate()
    const result = createOrganizationTemplateSchema.safeParse({
      ...values,
      isDefault: isDefault.value,
      units: units.value,
      positions: positions.value,
    })
    if (!result.success) {
      error.value = result.error.issues
        .map((issue) => `${issue.path.join('.')}：${issue.message}`)
        .join('；')
      return
    }
    error.value = ''
    if (await props.save(result.data)) open.value = false
  } catch {
    /* 字段校验由 SchemaForm 展示。 */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="tr(record ? '编辑项目组织模板' : '创建项目组织模板')"
    :width="1100"
    :confirm-loading="saving"
    :mask-closable="false"
    destroy-on-hidden
    :ok-text="tr('保存模板')"
    :cancel-text="tr('取消')"
    @ok="submit"
    @cancel="!saving && (open = false)"
  >
    <Alert
      style="margin-bottom: 20px"
      type="info"
      show-icon
      :title="tr('模板只在创建项目时复制一次')"
      :description="tr('之后修改模板不会同步到已有项目；模板岗位独立于模板组织单元。')"
    />
    <SchemaForm
      v-if="open"
      ref="form"
      v-model="model"
      :form-props="{ name: formName }"
      :columns="columns"
      :submitter="false"
      layout="vertical"
    />
    <Checkbox v-model:checked="isDefault" :disabled="record?.status === 'disabled'">
      {{ tr('作为默认模板') }}
    </Checkbox>
    <Tabs v-model:active-key="tab">
      <Tabs.TabPane key="units" :tab="`${tr('组织单元')} (${units.length})`">
        <div class="editor-scroll">
          <table class="editor-table">
            <thead>
              <tr>
                <th>{{ tr('名称') }}</th>
                <th>{{ tr('编码') }}</th>
                <th>{{ tr('上级组织') }}</th>
                <th>{{ tr('说明') }}</th>
                <th>{{ tr('排序') }}</th>
                <th>{{ tr('操作') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(unit, index) in units" :key="unit.clientKey">
                <td><Input v-model:value="unit.name" :maxlength="100" /></td>
                <td><Input v-model:value="unit.code" :maxlength="32" /></td>
                <td>
                  <Select
                    :value="unit.parentClientKey ?? ''"
                    :options="parentOptions(unit.clientKey)"
                    style="min-width: 145px"
                    show-search
                    option-filter-prop="label"
                    @change="(value) => (unit.parentClientKey = value ? String(value) : null)"
                  />
                </td>
                <td><Input v-model:value="unit.description" :maxlength="500" /></td>
                <td><InputNumber v-model:value="unit.sort" :min="0" :precision="0" /></td>
                <td>
                  <Button danger type="link" @click="removeUnit(index)">
                    {{ tr('删除') }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Button @click="addUnit">＋ {{ tr('新增组织单元') }}</Button>
        <p class="muted">
          {{ tr('删除组织单元后，其直接下级提升至原上级。组织单元最多 10 层。') }}
        </p>
      </Tabs.TabPane>
      <Tabs.TabPane key="positions" :tab="`${tr('岗位')} (${positions.length})`">
        <div class="editor-scroll">
          <table class="editor-table">
            <thead>
              <tr>
                <th>{{ tr('岗位名称') }}</th>
                <th>{{ tr('编码') }}</th>
                <th>{{ tr('说明') }}</th>
                <th>{{ tr('状态') }}</th>
                <th>{{ tr('操作') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(position, index) in positions" :key="index">
                <td><Input v-model:value="position.name" :maxlength="100" /></td>
                <td><Input v-model:value="position.code" :maxlength="32" /></td>
                <td><Input v-model:value="position.description" :maxlength="500" /></td>
                <td>
                  <Select
                    v-model:value="position.status"
                    :options="statuses"
                    style="width: 100px"
                  />
                </td>
                <td>
                  <Button danger type="link" @click="positions.splice(index, 1)">
                    {{ tr('删除') }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Button @click="positions.push({ name: '', code: '', description: '', status: 'active' })">
          ＋ {{ tr('新增岗位') }}
        </Button>
      </Tabs.TabPane>
    </Tabs>
    <Alert v-if="error" type="error" :title="error" show-icon />
  </Modal>
</template>
