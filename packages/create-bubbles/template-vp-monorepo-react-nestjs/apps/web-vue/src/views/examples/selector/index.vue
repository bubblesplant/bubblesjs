<script setup lang="ts">
import type { FormInstance } from 'antdv-next'
import type { OrganizationDuty } from 'shared/types'
import { useI18n } from '@bubblesjs/i18n-vue'
import {
  Alert,
  Button,
  Card,
  Form,
  FormItem,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  TreeSelect,
} from 'antdv-next'
import { computed, ref } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'

type Field = 'accounts' | 'members' | 'roles' | 'units' | 'relationUnits' | 'positions'
const { tr } = useI18n()
const scope = ref('company')
const multiple = ref('multiple')
const disabled = ref(false)
const form = ref<FormInstance>()
const model = ref<Record<Field, string[]>>({
  accounts: [],
  members: [],
  roles: [],
  units: [],
  relationUnits: [],
  positions: [],
})
const duties = ref<Record<string, OrganizationDuty>>({})
const saved = ref('')
const changes = ref<Record<string, unknown>>({})
const people = computed(() =>
  Array.from({ length: 30 }, (_, index) => ({
    value: `${scope.value}-demo-user-${index}`,
    label: `${tr('演示成员')} ${index + 1} · demo${index + 1}`,
    account: `demo${index + 1}`,
    disabled: index === 4,
  })),
)
const roles = computed(() =>
  ['项目负责人', '内容维护员', '只读成员'].map((name, index) => ({
    value: `${scope.value}-role-${index}`,
    label: tr(name),
  })),
)
const positions = computed(() =>
  ['产品经理', '开发工程师', '测试工程师'].map((name, index) => ({
    value: `${scope.value}-position-${index}`,
    label: tr(name),
  })),
)
const flatUnits = computed(() =>
  ['演示团队', '设计组', '研发组', '前端小组'].map((name, index) => ({
    value: `${scope.value}-unit-${index}`,
    label: tr(name),
  })),
)
const units = computed(() => [
  {
    value: flatUnits.value[0]!.value,
    title: flatUnits.value[0]!.label,
    children: [
      { value: flatUnits.value[1]!.value, title: flatUnits.value[1]!.label },
      {
        value: flatUnits.value[2]!.value,
        title: flatUnits.value[2]!.label,
        children: [{ value: flatUnits.value[3]!.value, title: flatUnits.value[3]!.label }],
      },
    ],
  },
])
const dutyOptions = computed(() => [
  { value: 'member', label: tr('成员') },
  { value: 'deputy', label: tr('副负责人') },
  { value: 'leader', label: tr('负责人') },
])
const fields = computed(() => [
  { key: 'accounts' as const, label: tr('平台账号'), options: people.value },
  { key: 'members' as const, label: tr('成员'), options: people.value },
  { key: 'roles' as const, label: tr('角色'), options: roles.value },
  { key: 'positions' as const, label: tr('岗位'), options: positions.value },
])
const values = computed(() => ({
  accountIds: model.value.accounts,
  memberIds: model.value.members,
  roleIds: model.value.roles,
  organizationIds: model.value.units,
  positionIds: model.value.positions,
  organizationRelations: model.value.relationUnits.map((id) => ({
    organizationUnitId: id,
    duties: [duties.value[id] ?? 'member'],
  })),
}))
/** 无论单选还是多选，都在表单中保存稳定的 ID 数组并记录独立候选快照。 */
function change(field: Field, value: unknown) {
  const ids = (Array.isArray(value) ? value : value ? [value] : []).map(String)
  model.value[field] = ids
  const candidates =
    field === 'roles'
      ? roles.value
      : field === 'positions'
        ? positions.value
        : field === 'units' || field === 'relationUnits'
          ? flatUnits.value
          : people.value
  changes.value[field] = JSON.parse(
    JSON.stringify({
      values: field === 'relationUnits' ? values.value.organizationRelations : ids,
      records: candidates.filter((item) => ids.includes(item.value)),
    }),
  )
}
/** 模式和作用域切换时移除旧 ID、职责以及提交快照。 */
function reset() {
  model.value = {
    accounts: [],
    members: [],
    roles: [],
    units: [],
    relationUnits: [],
    positions: [],
  }
  duties.value = {}
  saved.value = ''
  changes.value = {}
  form.value?.clearValidate()
}
/** 用当前作用域的虚构候选展示回填，不产生服务端写操作。 */
function fill() {
  for (const field of fields.value) change(field.key, field.options[0]!.value)
  change('units', flatUnits.value[1]!.value)
  change('relationUnits', flatUnits.value[2]!.value)
}
/** 完整校验后生成值和候选记录的提交快照，后续编辑不修改历史输出。 */
async function submit() {
  try {
    await form.value?.validate()
    saved.value = JSON.stringify({ values: values.value, records: changes.value }, null, 2)
  } catch {
    /* 必填错误由表单展示。 */
  }
}
</script>

<template>
  <PageHeading
    :title="tr('选择器示例')"
    :description="tr('展示多选、搜索、组织层级与禁用候选。')"
  />
  <Alert
    style="margin-bottom: 20px"
    type="info"
    show-icon
    :title="tr('此页面使用虚构演示数据，不会修改工作空间。')"
  />
  <Space wrap style="margin-bottom: 20px">
    <Segmented
      v-model:value="scope"
      :options="[
        { value: 'company', label: tr('企业') },
        { value: 'project', label: tr('项目') },
      ]"
      @change="reset"
    />
    <Segmented
      v-model:value="multiple"
      :aria-label="tr('选择模式')"
      :options="[
        { value: 'single', label: tr('单选') },
        { value: 'multiple', label: tr('多选') },
      ]"
      @change="reset"
    />
    <Switch v-model:checked="disabled" :aria-label="tr('禁用表单')" />
    <span>{{ tr('禁用表单') }}</span>
  </Space>
  <Card>
    <Form ref="form" :model="model" :disabled="disabled" layout="vertical">
      <div class="form-grid">
        <FormItem
          v-for="field in fields"
          :key="field.key"
          :label="field.label"
          :name="field.key"
          :rules="[{ type: 'array', required: true, min: 1, message: tr('请选择至少一项') }]"
        >
          <Select
            :value="multiple === 'multiple' ? model[field.key] : model[field.key][0]"
            :mode="multiple === 'multiple' ? 'multiple' : undefined"
            :options="field.options"
            show-search
            option-filter-prop="label"
            allow-clear
            @update:value="(value) => change(field.key, value)"
          />
        </FormItem>
        <FormItem
          :label="tr('组织单元')"
          name="units"
          :rules="[{ type: 'array', required: true, min: 1, message: tr('请选择至少一项') }]"
        >
          <TreeSelect
            :value="multiple === 'multiple' ? model.units : model.units[0]"
            :tree-data="units"
            :tree-checkable="multiple === 'multiple'"
            tree-default-expand-all
            allow-clear
            style="width: 100%"
            @update:value="(value) => change('units', value)"
          />
        </FormItem>
        <FormItem
          :label="tr('组织与职责')"
          name="relationUnits"
          :rules="[{ type: 'array', required: true, min: 1, message: tr('请选择至少一项') }]"
        >
          <TreeSelect
            :value="multiple === 'multiple' ? model.relationUnits : model.relationUnits[0]"
            :tree-data="units"
            :tree-checkable="multiple === 'multiple'"
            tree-default-expand-all
            allow-clear
            style="width: 100%"
            @update:value="(value) => change('relationUnits', value)"
          />
        </FormItem>
      </div>
      <div
        v-for="id in model.relationUnits"
        :key="id"
        class="editor-row"
        style="margin-bottom: 12px"
      >
        <span style="flex: 1">{{ flatUnits.find((item) => item.value === id)?.label }}</span>
        <Select
          :value="duties[id] ?? 'member'"
          :aria-label="tr('职责')"
          :options="dutyOptions"
          style="width: 150px"
          @update:value="
            (value) => {
              duties[id] = value as OrganizationDuty
              change('relationUnits', model.relationUnits)
            }
          "
        />
      </div>
      <Space wrap>
        <Button type="primary" :disabled="disabled" @click="submit">{{ tr('提交') }}</Button>
        <Button :disabled="disabled" @click="fill">{{ tr('填入示例') }}</Button>
        <Button :disabled="disabled" @click="reset">{{ tr('重置') }}</Button>
      </Space>
    </Form>
    <Tabs>
      <Tabs.TabPane key="current" :tab="tr('表单当前值')">
        <pre class="demo-output">{{ JSON.stringify(values, null, 2) }}</pre>
      </Tabs.TabPane>
      <Tabs.TabPane key="records" :tab="tr('候选记录')">
        <pre class="demo-output">{{ JSON.stringify(changes, null, 2) }}</pre>
      </Tabs.TabPane>
      <Tabs.TabPane key="submitted" :tab="tr('最近提交结果')">
        <pre class="demo-output">{{ saved || tr('点击提交表单后查看结果') }}</pre>
      </Tabs.TabPane>
    </Tabs>
  </Card>
</template>
