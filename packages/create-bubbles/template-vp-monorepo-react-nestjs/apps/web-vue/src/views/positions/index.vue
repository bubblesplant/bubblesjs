<script setup lang="ts">
import type { ProColumns, ProTableInstance } from '@bubblesjs/antdv-next-pro'
import type { OrganizationScope, PositionRecord } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Button, Space } from 'antdv-next'
import { computed, ref } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { descriptionField, statusEnum, textField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import AssignmentDialog from '@/components/selector/AssignmentDialog.vue'
import { positionsApi } from './api'

type Row = PositionRecord & Record<string, unknown>
const { scope, title, can, act, showError, tr } = useWorkspace()
const organizationScope = scope as OrganizationScope
const api = positionsApi(organizationScope)
const table = ref<ProTableInstance<Row>>()
const current = ref<Row>()
const open = ref(false)
const assignOpen = ref(false)
const fields = computed(() => [
  textField('name', tr('岗位名称')),
  textField('code', tr('编码')),
  descriptionField,
])
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('岗位名称'),
    dataIndex: 'name',
    hideInSearch: true,
  },
  {
    title: tr('编码'),
    dataIndex: 'code',
    hideInSearch: true,
  },
  {
    title: tr('状态'),
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: statusEnum(tr),
  },
  {
    title: tr('说明'),
    dataIndex: 'description',
    hideInSearch: true,
  },
  {
    title: tr('任职人数'),
    dataIndex: 'memberCount',
    hideInSearch: true,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 260,
  },
])
/** 将表格分页和筛选映射为当前空间的岗位查询。 */
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
/** 创建岗位或按读取时的版本更新，失败保留编辑内容。 */
async function save(values: Record<string, unknown>) {
  const body = {
    name: String(values.name),
    code: String(values.code),
    description: String(values.description ?? ''),
  }
  return act(
    () =>
      current.value
        ? api.update(current.value.id, { ...body, expectedVersion: current.value.version })
        : api.create(body),
    () => table.value?.reload(),
  )
}
</script>

<template>
  <PageHeading :title="title" :description="tr('维护岗位目录，并为成员配置任职关系。')" />
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    row-key="id"
    :scroll="{ x: 950 }"
    @request-error="showError"
  >
    <template #toolbar-actions>
      <Button
        v-if="can('create')"
        type="primary"
        @click="
          current = undefined;
          open = true
        "
      >
        ＋ {{ tr('创建岗位') }}
      </Button>
    </template>
    <template #cell-actions="{ record }">
      <Space :size="0">
        <Button
          v-if="can('update')"
          type="link"
          size="small"
          @click="
            current = record;
            open = true
          "
        >
          {{ tr('编辑') }}
        </Button>
        <Button
          v-if="can('assign')"
          type="link"
          size="small"
          @click="
            current = record;
            assignOpen = true
          "
        >
          {{ tr('分配成员') }}
        </Button>
        <Button
          v-if="can('update')"
          type="link"
          size="small"
          @click="
            act(
              () =>
                api.updateStatus(record.id, {
                  expectedVersion: record.version,
                  status: record.status === 'active' ? 'disabled' : 'active',
                }),
              () => table?.reload(),
            )
          "
        >
          {{ tr(record.status === 'active' ? '停用' : '启用') }}
        </Button>
      </Space>
    </template>
  </ProTable>
  <SchemaDialog
    v-model:open="open"
    :title="tr(current ? '编辑岗位' : '创建岗位')"
    :columns="fields"
    :initial="current ? { ...current } : {}"
    :save="save"
  />
  <AssignmentDialog
    v-model:open="assignOpen"
    :scope="organizationScope"
    kind="position"
    :target="current"
    @saved="table?.reload()"
  />
</template>
