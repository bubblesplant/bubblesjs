<script setup lang="ts">
import type { ProColumns, ProTableInstance } from '@bubblesjs/antdv-next-pro'
import type { CreateDictionaryRequest, DictionaryRecord } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Button, Modal } from 'antdv-next'
import { computed, ref } from 'vue'
import DictionarySelect from '@/components/dictionary/DictionarySelect.vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { statusEnum } from '@/components/management/schema'
import { useWorkspace } from '@/components/management/useWorkspace'
import { dictionaryCache } from '@/store/dictionary'
import { dictionaryApi } from './api'
import DictionaryDialog from './DictionaryDialog.vue'

type Row = DictionaryRecord & Record<string, unknown>
const { scope, title, can, act, showError, tr } = useWorkspace()
const api = dictionaryApi(scope)
const table = ref<ProTableInstance<Row>>()
const record = ref<DictionaryRecord>()
const open = ref(false)
const preview = ref<DictionaryRecord>()
const choice = ref<string | string[]>()
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('字典名称'),
    dataIndex: 'name',
    hideInSearch: true,
  },
  {
    title: tr('字典编码'),
    dataIndex: 'code',
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
    title: tr('选项数量'),
    key: 'count',
    hideInSearch: true,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 180,
  },
])
/** 转换 ProTable 分页，原样保留字典版本供更新使用。 */
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
/** 字典更新只失效自身选项缓存，不重建与本次操作无关的授权。 */
async function save(body: CreateDictionaryRequest) {
  return act(
    async () => {
      if (record.value) {
        const { code: _code, ...fields } = body
        await api.update(record.value.id, { ...fields, expectedVersion: record.value.version })
      } else {
        await api.create(body)
      }
      dictionaryCache.invalidate({ scope, code: body.code })
    },
    () => table.value?.reload(),
  )
}
</script>

<template>
  <PageHeading :title="title" :description="tr('统一维护业务选项，按工作空间独立管理。')" />
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
          record = undefined;
          open = true
        "
      >
        ＋ {{ tr('新增数据字典') }}
      </Button>
    </template>
    <template #cell-count="{ record: row }">
      {{ row.items.length }}
    </template>
    <template #cell-actions="{ record: row }">
      <Button
        v-if="can('update')"
        type="link"
        size="small"
        @click="
          record = row;
          open = true
        "
      >
        {{ tr('编辑') }}
      </Button>
      <Button
        type="link"
        size="small"
        @click="
          preview = row;
          choice = undefined
        "
      >
        {{ tr('选项预览') }}
      </Button>
    </template>
  </ProTable>
  <DictionaryDialog v-model:open="open" :record="record" :save="save" />
  <Modal
    :open="!!preview"
    :title="`${preview?.name} · ${tr('选项预览')}`"
    :footer="null"
    destroy-on-hidden
    @cancel="preview = undefined"
  >
    <DictionarySelect v-if="preview" v-model="choice" :scope="scope" :code="preview.code" />
  </Modal>
</template>
