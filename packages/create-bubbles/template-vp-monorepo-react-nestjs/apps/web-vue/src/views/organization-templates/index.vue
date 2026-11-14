<script setup lang="ts">
import type { ProColumns, ProTableInstance } from '@bubblesjs/antdv-next-pro'
import type {
  CreateOrganizationTemplateRequest,
  OrganizationTemplateRecord,
  OrganizationTemplateSummary,
} from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Button, Popconfirm, Space, Tag } from 'antdv-next'
import { computed, onBeforeUnmount, ref } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { statusEnum } from '@/components/management/schema'
import { useWorkspace } from '@/components/management/useWorkspace'
import { organizationTemplatesApi } from './api'
import TemplateDialog from './TemplateDialog.vue'

type Row = OrganizationTemplateSummary & Record<string, unknown>
const { scope, title, can, act, showError, tr } = useWorkspace()
if (scope.type !== 'company') throw new Error('组织模板页仅支持企业作用域')
const api = organizationTemplatesApi(scope.companyId)
const table = ref<ProTableInstance<Row>>()
const open = ref(false)
const record = ref<OrganizationTemplateRecord>()
const editingId = ref('')
let generation = 0
onBeforeUnmount(() => {
  generation++
})
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('模板名称'),
    dataIndex: 'name',
    hideInSearch: true,
  },
  {
    title: tr('说明'),
    dataIndex: 'description',
    hideInSearch: true,
  },
  {
    title: tr('状态'),
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: statusEnum(tr),
  },
  {
    title: tr('组织单元'),
    dataIndex: 'unitCount',
    hideInSearch: true,
  },
  {
    title: tr('岗位'),
    dataIndex: 'positionCount',
    hideInSearch: true,
  },
  {
    title: tr('版本'),
    dataIndex: 'version',
    hideInSearch: true,
  },
  {
    title: tr('默认'),
    key: 'default',
    hideInSearch: true,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 280,
  },
])
/** 列表只加载摘要，编辑时读取完整当前版本。 */
async function request(params: Record<string, unknown>) {
  const result = await api.list({
    page: Number(params.current ?? 1),
    pageSize: Number(params.pageSize ?? 10),
    query: params.query as string,
    status: params.status as 'active' | 'disabled',
  })
  return {
    data: result.items.map((item) => ({ ...item })),
    total: result.total,
    success: true,
  }
}
/** 连续打开不同模板时只展示最后一次请求的结果。 */
async function edit(row: Row) {
  const requestId = ++generation
  editingId.value = row.id
  try {
    const result = await api.detail(row.id)
    if (requestId === generation) {
      record.value = result
      open.value = true
    }
  } catch (error) {
    if (requestId === generation) showError(error)
  } finally {
    if (requestId === generation) editingId.value = ''
  }
}
/** 全量替换携带当前版本；冲突保留弹窗，由用户核对后重试。 */
async function save(body: CreateOrganizationTemplateRequest) {
  return act(
    () =>
      record.value
        ? api.replace(record.value.id, {
            ...body,
            isDefault: body.isDefault ?? false,
            expectedVersion: record.value.version,
          })
        : api.create(body),
    () => table.value?.reload(),
  )
}
</script>

<template>
  <PageHeading :title="title" :description="tr('沉淀团队组织与岗位，为新项目提供一致的起点。')" />
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    row-key="id"
    :scroll="{ x: 1100 }"
    @request-error="showError"
  >
    <template #toolbar-actions>
      <Button
        v-if="can('create')"
        type="primary"
        @click="
          generation++;
          record = undefined;
          open = true
        "
      >
        ＋ {{ tr('创建项目组织模板') }}
      </Button>
    </template>
    <template #cell-default="{ record: row }">
      <Tag v-if="row.isDefault" color="purple">{{ tr('默认模板') }}</Tag>
      <span v-else>—</span>
    </template>
    <template #cell-actions="{ record: row }">
      <Space :size="0" wrap>
        <Button
          v-if="can('update')"
          type="link"
          size="small"
          :loading="editingId === row.id"
          @click="edit(row)"
        >
          {{ tr('编辑定义') }}
        </Button>
        <Popconfirm
          v-if="can('update') && row.status === 'active' && !row.isDefault"
          :title="tr('设为默认模板？')"
          :description="tr('企业现有默认模板会自动取消默认。')"
          @confirm="
            act(
              () => api.updateStatus(row.id, { expectedVersion: row.version, isDefault: true }),
              () => table?.reload(),
            )
          "
        >
          <Button type="link" size="small">
            {{ tr('设为默认') }}
          </Button>
        </Popconfirm>
        <Popconfirm
          v-if="can('update')"
          :title="tr(row.status === 'active' ? '停用模板？' : '恢复模板？')"
          :description="tr('停用模板不能用于新项目，历史项目不受影响。')"
          @confirm="
            act(
              () =>
                api.updateStatus(row.id, {
                  expectedVersion: row.version,
                  status: row.status === 'active' ? 'disabled' : 'active',
                }),
              () => table?.reload(),
            )
          "
        >
          <Button type="link" size="small">
            {{ tr(row.status === 'active' ? '停用' : '启用') }}
          </Button>
        </Popconfirm>
      </Space>
    </template>
  </ProTable>
  <TemplateDialog v-model:open="open" :record="record" :save="save" />
</template>
