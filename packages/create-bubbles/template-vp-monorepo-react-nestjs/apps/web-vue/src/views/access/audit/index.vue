<script setup lang="ts">
import type { ProColumns } from '@bubblesjs/antdv-next-pro'
import type { AuditRecord } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { computed } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { useWorkspace } from '@/components/management/useWorkspace'

type Row = AuditRecord & Record<string, unknown>
const { api, title, showError, tr } = useWorkspace()
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('操作'),
    dataIndex: 'action',
  },
  {
    title: tr('操作人'),
    dataIndex: ['actor', 'name'],
    hideInSearch: true,
  },
  {
    title: tr('摘要'),
    dataIndex: 'summary',
    hideInSearch: true,
    ellipsis: true,
    renderText: (_value, row) => JSON.stringify(row.summary),
  },
  {
    title: tr('对象类型'),
    dataIndex: 'objectType',
    hideInSearch: true,
  },
  {
    title: tr('请求标识'),
    dataIndex: 'requestId',
    hideInSearch: true,
    copyable: true,
  },
  {
    title: tr('开始时间'),
    dataIndex: 'from',
    valueType: 'dateTime',
    hideInTable: true,
  },
  {
    title: tr('结束时间'),
    dataIndex: 'to',
    valueType: 'dateTime',
    hideInTable: true,
  },
  {
    title: tr('时间'),
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    hideInSearch: true,
  },
])
/** 保留时间及操作筛选，分页读取审计记录。 */
async function request(params: Record<string, unknown>) {
  const result = await api.audits({
    page: Number(params.current ?? 1),
    pageSize: Number(params.pageSize ?? 10),
    query: params.query as string,
    action: params.action as string,
    from: params.from as string,
    to: params.to as string,
  })
  return {
    data: result.items.map((item) => ({ ...item })),
    total: result.total,
    success: true,
  }
}
</script>

<template>
  <PageHeading :title="title" :description="tr('追踪关键操作，查看变更来源与执行时间。')" />
  <ProTable
    :columns="columns"
    :request="request"
    row-key="id"
    :scroll="{ x: 1100 }"
    @request-error="showError"
  />
</template>
