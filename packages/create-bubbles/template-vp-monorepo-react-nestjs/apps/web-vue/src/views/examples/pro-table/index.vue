<script setup lang="ts">
import type {
  ProColumns,
  ProTableInstance,
  SchemaFormColumn,
  SchemaFormInstance,
} from '@bubblesjs/antdv-next-pro'
import { ProTable, SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, App, Button, Modal, Popconfirm, Segmented, Space } from 'antdv-next'
import { computed, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeading from '@/components/management/PageHeading.vue'

type Project = Record<string, unknown> & {
  id: string
  name: string
  owner: string
  status: 'planning' | 'active' | 'completed'
  priority: 'high' | 'normal' | 'low'
  dueDate: string
  stage: 'draft' | 'published'
}
const { tr } = useI18n()
const { message } = App.useApp()
const route = useRoute()
const draft = route.path.endsWith('/draft')
const storageKey = 'bubbles-vue-demo-drafts'
const initial: Project[] = Array.from({ length: 18 }, (_, index) => ({
  id: `DEMO-${(index + 1).toString().padStart(3, '0')}`,
  name: `${['星云协作平台', '微光设计系统', '云端数据中心'][index % 3]} ${index + 1}`,
  owner: ['演示成员甲', '演示成员乙', '演示成员丙'][index % 3]!,
  status: (['planning', 'active', 'completed'] as const)[index % 3]!,
  priority: (['normal', 'high', 'low'] as const)[index % 3]!,
  dueDate: `2026-12-${(index + 1).toString().padStart(2, '0')}`,
  stage: index < 3 ? 'draft' : 'published',
}))
/** 恢复本地演示草稿，结构损坏或存储不可用时使用初始虚构记录。 */
function restore(): Project[] {
  if (!draft) return initial
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (
      Array.isArray(saved) &&
      saved.every(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.owner === 'string' &&
          ['planning', 'active', 'completed'].includes(item.status) &&
          ['high', 'normal', 'low'].includes(item.priority) &&
          typeof item.dueDate === 'string' &&
          ['draft', 'published'].includes(item.stage),
      )
    )
      return saved
  } catch {
    /* 浏览器可能禁用存储，仍允许查看演示。 */
  }
  return initial
}
const records = ref(restore())
const view = ref('published')
const table = ref<ProTableInstance<Project>>()
const selected = ref<Array<string | number>>([])
const current = ref<Project>()
const open = ref(false)
const form = ref<SchemaFormInstance>()
const formName = `project-editor-${useId()}`
const model = ref<Record<string, unknown>>({})
const draftCount = computed(() => records.value.filter((item) => item.stage === 'draft').length)
const statusEnum = computed(() => ({
  planning: {
    text: tr('规划中'),
    status: 'Default',
  },
  active: {
    text: tr('进行中'),
    status: 'Processing',
  },
  completed: {
    text: tr('已完成'),
    status: 'Success',
  },
}))
const priorityEnum = computed(() => ({
  high: {
    text: tr('高'),
  },
  normal: {
    text: tr('中'),
  },
  low: {
    text: tr('低'),
  },
}))
const columns = computed<ProColumns<Project>[]>(() => [
  {
    title: tr('项目名称'),
    dataIndex: 'name',
  },
  {
    title: tr('负责人'),
    dataIndex: 'owner',
  },
  {
    title: tr('状态'),
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: statusEnum.value,
  },
  {
    title: tr('优先级'),
    dataIndex: 'priority',
    valueType: 'select',
    valueEnum: priorityEnum.value,
  },
  {
    title: tr('截止日期'),
    dataIndex: 'dueDate',
    valueType: 'date',
    sorter: true,
    hideInSearch: true,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 160,
  },
])
const fields = computed<SchemaFormColumn[]>(() => [
  {
    title: tr('项目名称'),
    dataIndex: 'name',
    formItemProps: {
      rules: [{ required: true, whitespace: true, max: 100 }],
    },
  },
  {
    title: tr('负责人'),
    dataIndex: 'owner',
    formItemProps: {
      rules: [{ required: true, whitespace: true, max: 100 }],
    },
  },
  {
    title: tr('状态'),
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: statusEnum.value,
  },
  {
    title: tr('优先级'),
    dataIndex: 'priority',
    valueType: 'select',
    valueEnum: priorityEnum.value,
  },
  {
    title: tr('截止日期'),
    dataIndex: 'dueDate',
    valueType: 'date',
    formItemProps: {
      rules: [{ required: true }],
    },
  },
])
watch(view, () => {
  selected.value = []
  void table.value?.reset()
})
/** 模拟分页查询，只操作此示例的虚构数据。 */
async function request(params: Record<string, unknown>, sort: Record<string, unknown>) {
  const items = records.value.filter(
    (item) =>
      item.stage === view.value &&
      (!params.name || item.name.includes(String(params.name))) &&
      (!params.owner || item.owner.includes(String(params.owner))) &&
      (!params.status || item.status === params.status) &&
      (!params.priority || item.priority === params.priority),
  )
  if (sort.dueDate) {
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) * (sort.dueDate === 'ascend' ? 1 : -1))
  }
  const page = Number(params.current ?? 1)
  const size = Number(params.pageSize ?? 10)
  return {
    data: items.slice((page - 1) * size, page * size),
    total: items.length,
    success: true,
  }
}
/** 打开独立编辑表单，避免修改列表记录直至保存成功。 */
function edit(record?: Project) {
  current.value = record
  model.value = record ? { ...record } : { status: 'planning', priority: 'normal' }
  open.value = true
}
/** 先写入存储再更新页面，失败时不关闭编辑器。 */
function persist(next: Project[]) {
  try {
    if (draft) localStorage.setItem(storageKey, JSON.stringify(next))
    records.value = next
    return true
  } catch {
    message.error(tr('保存失败，请检查浏览器存储空间后重试。'))
    return false
  }
}
/** 草稿允许信息未填完，正式提交必须通过字段校验。 */
async function save(stage: Project['stage']) {
  try {
    const values = stage === 'draft' ? model.value : await form.value!.validate()
    const record: Project = {
      id: current.value?.id ?? crypto.randomUUID(),
      name: String(values.name ?? ''),
      owner: String(values.owner ?? ''),
      status: values.status as Project['status'],
      priority: values.priority as Project['priority'],
      dueDate: String(values.dueDate ?? ''),
      stage,
    }
    const next = current.value
      ? records.value.map((item) => (item.id === current.value!.id ? record : item))
      : [record, ...records.value]
    if (!persist(next)) return
    open.value = false
    view.value = stage
    selected.value = []
    await table.value?.reload(true)
    message.success(tr(stage === 'draft' ? '草稿已保存' : '项目已保存'))
  } catch {
    /* 表单显示校验失败。 */
  }
}
function remove(ids: Array<string | number>) {
  if (persist(records.value.filter((item) => !ids.includes(item.id)))) {
    selected.value = []
    void table.value?.reload(true)
    message.success(tr('操作成功'))
  }
}
</script>

<template>
  <PageHeading
    :title="tr(draft ? '草稿编辑表格' : 'ProTable 示例')"
    :description="tr('支持搜索筛选、排序、分页、列设置和批量删除。')"
  />
  <Alert
    style="margin-bottom: 20px"
    type="info"
    show-icon
    :title="tr('此页面使用虚构演示数据，不会修改工作空间。')"
  />
  <Segmented
    v-if="draft"
    v-model:value="view"
    :options="[
      { value: 'published', label: tr('项目列表') },
      { value: 'draft', label: `${tr('我的草稿')} (${draftCount})` },
    ]"
    style="margin-bottom: 20px"
  />
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    :params="{ view }"
    row-key="id"
    :row-selection="{ selectedRowKeys: selected }"
    :scroll="{ x: 900 }"
    @selection-change="(keys) => (selected = keys)"
  >
    <template #toolbar-actions>
      <Popconfirm
        v-if="selected.length"
        :title="tr('确认删除所选记录？')"
        @confirm="remove(selected)"
      >
        <Button danger>{{ tr('批量删除') }} ({{ selected.length }})</Button>
      </Popconfirm>
      <Button type="primary" @click="edit()">＋ {{ tr('新增项目') }}</Button>
    </template>
    <template #cell-actions="{ record }">
      <Button type="link" size="small" @click="edit(record)">{{ tr('编辑') }}</Button>
      <Popconfirm :title="tr('确认删除记录？')" @confirm="remove([record.id])">
        <Button type="link" size="small" danger>
          {{ tr('删除') }}
        </Button>
      </Popconfirm>
    </template>
  </ProTable>
  <Modal
    :open="open"
    :title="tr(current ? '编辑项目' : '新增项目')"
    :footer="null"
    destroy-on-hidden
    :mask-closable="false"
    @cancel="open = false"
  >
    <SchemaForm
      v-if="open"
      ref="form"
      v-model="model"
      :form-props="{ name: formName }"
      :columns="fields"
      :submitter="false"
      layout="vertical"
    />
    <Space style="display: flex; justify-content: flex-end">
      <Button @click="open = false">{{ tr('取消') }}</Button>
      <Button v-if="draft" @click="save('draft')">{{ tr('保存草稿') }}</Button>
      <Button type="primary" @click="save('published')">
        {{ tr('提交') }}
      </Button>
    </Space>
  </Modal>
</template>
