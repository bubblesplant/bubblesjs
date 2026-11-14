<script setup lang="ts">
import type { ProColumns, ProTableInstance, SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import type { AdministratorSummary, CompanyRecord, ProjectRecord } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Button, Modal, Space, Tag } from 'antdv-next'
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { descriptionField, statusEnum, textField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import CandidateSelect from '@/components/selector/CandidateSelect.vue'
import { loadPages } from '@/components/selector/choices'
import { refreshAccess } from '@/utils/request/workspace'

type Row = (CompanyRecord | ProjectRecord) & Record<string, unknown>
const { api, scope, title, can, act, showError, tr } = useWorkspace()
const platform = scope.type === 'platform'
const table = ref<ProTableInstance<Row>>()
const open = ref(false)
const adminOpen = ref(false)
const detailOpen = ref(false)
const current = ref<Row>()
const admins = ref<AdministratorSummary[]>([])
const templates = ref<Array<{ value: string; label: string; version: number }>>([])
let administratorRevision = 0
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('名称'),
    dataIndex: 'name',
    hideInSearch: true,
  },
  {
    title: tr('编码'),
    dataIndex: 'code',
    hideInSearch: true,
    copyable: true,
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
    ellipsis: true,
  },
  {
    title: tr('创建时间'),
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    hideInSearch: true,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 270,
  },
])
const fields = computed<SchemaFormColumn[]>(() => [
  textField('name', tr('名称')),
  textField('code', tr('编码')),
  { ...descriptionField, title: tr('说明') },
  {
    title: tr('管理员'),
    dataIndex: 'administratorUserId',
    formItemProps: {
      rules: [
        {
          required: true,
          message: tr('请选择管理员'),
        },
      ],
    },
    renderFormItem: (_column, context) =>
      h(CandidateSelect, {
        scope,
        purpose: platform ? 'createCompanyAdministrator' : 'createProjectAdministrator',
        modelValue: context.record.administratorUserId as string,
        'onUpdate:modelValue': context.update,
      }),
  },
  ...(!platform
    ? [
        {
          title: tr('组织初始化'),
          dataIndex: 'templateId',
          valueType: 'select' as const,
          fieldProps: {
            options: [
              {
                value: '',
                label: tr('空白组织'),
              },
              ...templates.value,
            ],
            allowClear: true,
          },
        },
      ]
    : []),
])
const adminFields = computed<SchemaFormColumn[]>(() => [
  {
    ...fields.value[3]!,
    renderFormItem: (_column, context) =>
      h(CandidateSelect, {
        scope,
        purpose: platform ? 'setCompanyAdministrator' : 'setProjectAdministrator',
        modelValue: context.record.administratorUserId as string,
        'onUpdate:modelValue': context.update,
      }),
  },
  {
    title: tr('替换原管理员'),
    dataIndex: 'replaceUserId',
    valueType: 'select',
    fieldProps: {
      allowClear: true,
      placeholder: tr('留空则补充管理员'),
      options: admins.value.map((item) => ({
        value: item.id,
        label: `${item.name} · ${item.account}`,
      })),
    },
  },
])
/** ProTable 的 current 映射到共享后端分页字段。 */
async function request(params: Record<string, unknown>) {
  const query = {
    page: Number(params.current ?? 1),
    pageSize: Number(params.pageSize ?? 10),
    query: params.query as string,
    status: params.status as 'active' | 'disabled' | undefined,
  }
  const result = platform ? await api.companies(query) : await api.projects(query)
  return {
    data: result.items.map((item) => ({ ...item })),
    total: result.total,
    success: true,
  }
}
/** 创建项目前只读取可用模板摘要，提交时携带所选版本。 */
async function create() {
  const startedAt = ++administratorRevision
  if (!platform) {
    try {
      const result = await loadPages((page) =>
        api.organizationTemplates({ page, pageSize: 100, status: 'active' }),
      )
      if (startedAt !== administratorRevision) return
      templates.value = result.map((item) => ({
        value: item.id,
        label: `${item.name} · v${item.version}`,
        version: item.version,
      }))
    } catch (error) {
      if (startedAt === administratorRevision) showError(error)
      return
    }
  }
  open.value = true
}
/** 提交新实体，禁止省略管理员或伪造模板版本。 */
async function save(values: Record<string, unknown>) {
  const body = {
    name: String(values.name).trim(),
    code: String(values.code).trim(),
    description: String(values.description ?? ''),
    administratorUserId: String(values.administratorUserId),
  }
  const template = templates.value.find((item) => item.value === values.templateId)
  return act(
    () =>
      platform
        ? api.createCompany(body)
        : api.createProject({
            ...body,
            organizationInitialization: template
              ? { mode: 'template', templateId: template.value, templateVersion: template.version }
              : { mode: 'blank' },
          }),
    () => table.value?.reload(),
  )
}
/** 管理员列表由详情接口确认，补充和替换使用稳定 userId。 */
async function showAdministrators(row: Row, edit = false) {
  const startedAt = ++administratorRevision
  try {
    const result = platform
      ? (await api.companyDetail(row.id)).administrators
      : await api.projectAdministrators(row.id)
    if (startedAt !== administratorRevision) return
    current.value = row
    admins.value = result
    if (edit) adminOpen.value = true
    else detailOpen.value = true
  } catch (error) {
    if (startedAt === administratorRevision) showError(error)
  }
}
/** 补充或替换管理员后刷新当前权限，防止继续显示已撤销操作。 */
async function saveAdministrator(values: Record<string, unknown>) {
  return act(
    () =>
      api.setAdministrator(current.value!.id, {
        administratorUserId: String(values.administratorUserId),
        ...(values.replaceUserId
          ? {
              replaceUserId: String(values.replaceUserId),
            }
          : {}),
      }),
    () => {
      refreshAccess()
      return table.value?.reload()
    },
  )
}
watch(
  [open, adminOpen, detailOpen],
  (values) => {
    if (values.some(Boolean)) administratorRevision++
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => administratorRevision++)
</script>

<template>
  <PageHeading
    :title="title"
    :description="
      tr(
        platform
          ? '管理企业及其管理员，建立独立的协作边界。'
          : '为团队创建项目，并配置项目管理员。',
      )
    "
  />
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    row-key="id"
    :scroll="{ x: 950 }"
    @request-error="showError"
  >
    <template #toolbar-actions>
      <Button v-if="can('create')" type="primary" @click="create">
        ＋ {{ tr(platform ? '开通企业' : '创建项目') }}
      </Button>
    </template>
    <template #cell-actions="{ record }">
      <Space>
        <Button type="link" size="small" @click="showAdministrators(record)">
          {{ tr('管理员') }}
        </Button>
        <Button
          v-if="can('administrator')"
          type="link"
          size="small"
          @click="showAdministrators(record, true)"
        >
          {{ tr('设置管理员') }}
        </Button>
        <Button
          v-if="can('status')"
          type="link"
          size="small"
          @click="
            act(
              () =>
                api.entityStatus(record.id, {
                  status: record.status === 'active' ? 'disabled' : 'active',
                  expectedVersion: record.version,
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
    :title="tr(platform ? '开通企业' : '创建项目')"
    :columns="fields"
    :save="save"
  />
  <SchemaDialog
    v-model:open="adminOpen"
    :title="tr('设置管理员')"
    :columns="adminFields"
    :save="saveAdministrator"
  />
  <Modal v-model:open="detailOpen" :title="tr('管理员')" :footer="null">
    <div v-for="item in admins" :key="item.id" class="editor-row">
      {{ item.name }} · {{ item.account }}
      <Tag :color="item.effective ? 'success' : 'default'">
        {{ tr(item.effective ? '有效' : '已停用') }}
      </Tag>
    </div>
  </Modal>
</template>
