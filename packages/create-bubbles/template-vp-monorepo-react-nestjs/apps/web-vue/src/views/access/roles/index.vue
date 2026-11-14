<script setup lang="ts">
import type { ProColumns, ProTableInstance } from '@bubblesjs/antdv-next-pro'
import type { PermissionTreeResult, RoleRecord } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Alert, Button, Checkbox, Modal, Popconfirm, Space, Tag } from 'antdv-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { descriptionField, textField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import { refreshAccess } from '@/utils/request/workspace'

type Row = RoleRecord & Record<string, unknown>
const { api, title, can, act, showError, tr } = useWorkspace()
const table = ref<ProTableInstance<Row>>()
const current = ref<RoleRecord>()
const open = ref(false)
const permissionsOpen = ref(false)
const saving = ref(false)
const tree = ref<PermissionTreeResult>()
const selected = ref<string[]>([])
let permissionRevision = 0
watch(open, (value) => {
  if (value) permissionRevision++
})
onBeforeUnmount(() => {
  permissionRevision++
})
const fields = computed(() => [textField('name', tr('角色名称')), descriptionField])
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('角色名称'),
    dataIndex: 'name',
    hideInSearch: true,
  },
  {
    title: tr('类型'),
    key: 'type',
    hideInSearch: true,
  },
  {
    title: tr('说明'),
    dataIndex: 'description',
    hideInSearch: true,
  },
  {
    title: tr('已分配人数'),
    dataIndex: 'memberCount',
    hideInSearch: true,
  },
  {
    title: tr('权限数量'),
    key: 'count',
    hideInSearch: true,
    renderText: (_value, row) => row.permissionKeys.length,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 240,
  },
])
const groups = computed(
  () =>
    tree.value?.permissions
      .filter((item) => item.kind === 'page')
      .map((page) => ({
        page,
        operations: tree.value!.permissions.filter((item) => item.pagePermissionKey === page.key),
      })) ?? [],
)
const readonly = computed(() => !!current.value?.builtin || !can('permissions'))
/** 按当前空间分页搜索角色，并保留服务端总数。 */
async function request(params: Record<string, unknown>) {
  const result = await api.roles({
    page: Number(params.current ?? 1),
    pageSize: Number(params.pageSize ?? 10),
    query: params.query as string,
  })
  return {
    data: result.items.map((item) => ({ ...item })),
    total: result.total,
    success: true,
  }
}
/** 创建自定义角色或使用版本条件更新其名称和说明。 */
async function save(values: Record<string, unknown>) {
  const body = {
    name: String(values.name),
    description: String(values.description ?? ''),
  }
  return act(
    () =>
      current.value
        ? api.updateRole(current.value.id, { ...body, expectedVersion: current.value.version })
        : api.createRole(body),
    () => table.value?.reload(),
  )
}
/** 权限编辑前同时读取角色最新版本和当前可授予目录。 */
async function permissions(row: RoleRecord) {
  const startedAt = ++permissionRevision
  try {
    const [latest, catalog] = await Promise.all([api.role(row.id), api.permissions()])
    if (startedAt !== permissionRevision) return
    current.value = latest
    tree.value = catalog
    selected.value = [...latest.permissionKeys]
    permissionsOpen.value = true
  } catch (error) {
    if (startedAt === permissionRevision) showError(error)
  }
}
/** 选择操作时补齐页面读取依赖，取消页面时移除其可编辑操作。 */
function toggle(key: string, checked: boolean) {
  const permission = tree.value!.permissions.find((item) => item.key === key)!
  const next = new Set(selected.value)
  if (checked) {
    next.add(key)
    if (permission.pagePermissionKey) next.add(permission.pagePermissionKey)
  } else {
    next.delete(key)
    if (permission.kind === 'page') {
      for (const item of tree.value!.permissions) {
        if (
          item.pagePermissionKey === key &&
          tree.value!.grantablePermissionKeys.includes(item.key)
        )
          next.delete(item.key)
      }
    }
  }
  selected.value = [...next]
}
/** 按角色版本替换权限集合，成功后刷新本人的最新访问权限。 */
async function savePermissions() {
  if (readonly.value || saving.value) return
  saving.value = true
  const success = await act(
    () =>
      api.rolePermissions(current.value!.id, {
        expectedVersion: current.value!.version,
        permissionKeys: selected.value,
      }),
    () => {
      refreshAccess()
      return table.value?.reload()
    },
  )
  saving.value = false
  if (success) permissionsOpen.value = false
}
</script>

<template>
  <PageHeading :title="title" :description="tr('通过角色配置页面与操作权限。')" />
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    row-key="id"
    :scroll="{ x: 900 }"
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
        ＋ {{ tr('创建角色') }}
      </Button>
    </template>
    <template #cell-type="{ record }">
      <Tag :color="record.builtin ? 'purple' : 'default'">
        {{ tr(record.builtin ? '内置角色' : '自定义角色') }}
      </Tag>
    </template>
    <template #cell-actions="{ record }">
      <Space :size="0">
        <Button type="link" size="small" @click="permissions(record)">
          {{ tr(record.builtin || !can('permissions') ? '查看权限' : '配置权限') }}
        </Button>
        <Button
          v-if="!record.builtin && can('update')"
          type="link"
          size="small"
          @click="
            current = record;
            open = true
          "
        >
          {{ tr('编辑') }}
        </Button>
        <Popconfirm
          v-if="!record.builtin && can('delete')"
          :title="tr('确定删除角色？')"
          @confirm="
            act(
              () => api.deleteRole(record.id, record.version),
              () => table?.reload(),
            )
          "
        >
          <Button type="link" size="small" danger :disabled="record.memberCount > 0">
            {{ tr('删除') }}
          </Button>
        </Popconfirm>
      </Space>
    </template>
  </ProTable>
  <SchemaDialog
    v-model:open="open"
    :title="tr(current ? '编辑角色' : '创建角色')"
    :columns="fields"
    :initial="current ? { name: current.name, description: current.description } : {}"
    :save="save"
  />
  <Modal
    :open="permissionsOpen"
    :title="`${tr(readonly ? '查看权限' : '配置权限')} · ${current?.name}`"
    :width="780"
    :confirm-loading="saving"
    :footer="readonly ? null : undefined"
    @ok="savePermissions"
    @cancel="!saving && (permissionsOpen = false)"
  >
    <Alert
      type="info"
      show-icon
      :message="tr('操作权限依赖对应的页面读取权限。')"
      style="margin-bottom: 20px"
    />
    <div
      v-for="group in groups"
      :key="group.page.key"
      class="panel"
      style="margin-bottom: 12px; padding: 16px"
    >
      <Checkbox
        :checked="selected.includes(group.page.key)"
        :disabled="readonly || !tree?.grantablePermissionKeys.includes(group.page.key)"
        @change="(event) => toggle(group.page.key, event.target.checked)"
      >
        {{ tr(group.page.title) }}
      </Checkbox>
      <div style="padding: 12px 0 0 24px; display: flex; gap: 16px; flex-wrap: wrap">
        <Checkbox
          v-for="operation in group.operations"
          :key="operation.key"
          :checked="selected.includes(operation.key)"
          :disabled="readonly || !tree?.grantablePermissionKeys.includes(operation.key)"
          @change="(event) => toggle(operation.key, event.target.checked)"
        >
          {{ tr(operation.title) }}
        </Checkbox>
      </div>
    </div>
  </Modal>
</template>
