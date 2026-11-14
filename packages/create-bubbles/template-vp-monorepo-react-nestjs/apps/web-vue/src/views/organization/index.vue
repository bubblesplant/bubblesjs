<script setup lang="ts">
import type { ProColumns, ProTableInstance, SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import type { OrganizationScope, OrganizationUnitNode } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Breadcrumb, Button, Space, Tag } from 'antdv-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { descriptionField, statusEnum, textField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import AssignmentDialog from '@/components/selector/AssignmentDialog.vue'
import { loadUnits } from '@/components/selector/choices'
import { organizationApi } from './api'

type Row = OrganizationUnitNode & Record<string, unknown>
const { scope, title, can, act, showError, tr } = useWorkspace()
const organizationScope = scope as OrganizationScope
const api = organizationApi(organizationScope)
const table = ref<ProTableInstance<Row>>()
const path = ref<OrganizationUnitNode[]>([])
const parentId = computed(() => path.value.at(-1)?.id)
const current = ref<Row>()
const open = ref(false)
const moveOpen = ref(false)
const assignOpen = ref(false)
let moveRevision = 0
const moveOptions = ref<Array<{ value: string; label: string; disabled: boolean }>>([])
const fields = computed<SchemaFormColumn[]>(() => [
  textField('name', tr('名称')),
  textField('code', tr('编码')),
  { ...descriptionField, title: tr('说明') },
  {
    title: tr('排序'),
    dataIndex: 'sort',
    valueType: 'digit',
    initialValue: 0,
    fieldProps: { min: 0, precision: 0 },
  },
])
const moveFields = computed<SchemaFormColumn[]>(() => [
  {
    title: tr('目标上级'),
    dataIndex: 'parentId',
    valueType: 'select',
    fieldProps: {
      options: [
        {
          value: '',
          label: tr('顶级组织'),
        },
        ...moveOptions.value,
      ],
      showSearch: true,
      optionFilterProp: 'label',
    },
  },
])
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('组织名称'),
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
    hideInSearch: true,
  },
  {
    title: tr('生效状态'),
    key: 'effective',
    hideInSearch: true,
  },
  {
    title: tr('排序'),
    dataIndex: 'sort',
    hideInSearch: true,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 330,
  },
])
/** 只读取当前父节点的一层组织，进入下级后由参数变化触发重载。 */
async function request() {
  const result = await api.tree({ parentId: parentId.value })
  return {
    data: result.units.map((item) => ({ ...item })),
    total: result.units.length,
    success: true,
  }
}
/** 保留完整路径，子节点只在进入后请求一层。 */
function navigate(index: number) {
  path.value = path.value.slice(0, index)
}
/** 新增到当前层级或按版本更新组织基本信息。 */
async function save(values: Record<string, unknown>) {
  const body = {
    name: String(values.name).trim(),
    code: String(values.code).trim(),
    description: String(values.description ?? ''),
    sort: Number(values.sort ?? 0),
  }
  return act(
    () =>
      current.value
        ? api.updateUnit(current.value.id, { ...body, expectedVersion: current.value.version })
        : api.createUnit({ ...body, parentId: parentId.value ?? null }),
    () => table.value?.reload(),
  )
}
/** 移动候选排除自身和全部后代，避免循环树。 */
async function move(row: Row) {
  const startedAt = ++moveRevision
  try {
    const units = await loadUnits(organizationScope)
    if (startedAt !== moveRevision) return
    const excluded = new Set([row.id])
    let changed = true
    while (changed) {
      changed = false
      for (const unit of units) {
        if (unit.parentId && excluded.has(unit.parentId) && !excluded.has(unit.id)) {
          excluded.add(unit.id)
          changed = true
        }
      }
    }
    moveOptions.value = units.map((unit) => ({
      value: unit.id,
      label: unit.fullPath || unit.name,
      disabled: excluded.has(unit.id) || !unit.effective,
    }))
    current.value = row
    moveOpen.value = true
  } catch (error) {
    if (startedAt === moveRevision) showError(error)
  }
}
/** 提交目标父节点和版本，服务端再次检查循环和有效性。 */
async function saveMove(values: Record<string, unknown>) {
  return act(
    () =>
      api.moveUnit(current.value!.id, {
        expectedVersion: current.value!.version,
        parentId: values.parentId ? String(values.parentId) : null,
      }),
    () => table.value?.reload(),
  )
}
watch([open, assignOpen, parentId], () => moveRevision++, { flush: 'sync' })
onBeforeUnmount(() => moveRevision++)
</script>

<template>
  <PageHeading :title="title" :description="tr('按层级组织团队，为成员配置归属与职责。')" />
  <Breadcrumb style="margin-bottom: 18px">
    <Breadcrumb.Item><a @click="navigate(0)">{{ tr('全部组织') }}</a></Breadcrumb.Item>
    <Breadcrumb.Item v-for="(unit, index) in path" :key="unit.id">
      <a @click="navigate(index + 1)">{{ unit.name }}</a>
    </Breadcrumb.Item>
  </Breadcrumb>
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    :params="{ parentId }"
    row-key="id"
    :search="false"
    :pagination="false"
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
        ＋ {{ tr('新增组织') }}
      </Button>
    </template>
    <template #cell-name="{ record }">
      <Button v-if="record.hasChildren" type="link" @click="path.push(record)">
        {{ record.name }} →
      </Button>
      <span v-else>{{ record.name }}</span>
    </template>
    <template #cell-effective="{ record }">
      <Tag :color="record.effective ? 'success' : 'default'">
        {{ tr(record.effective ? '有效' : '受上级停用影响') }}
      </Tag>
    </template>
    <template #cell-actions="{ record }">
      <Space :size="0" wrap>
        <Button
          v-if="can('create')"
          type="link"
          size="small"
          @click="
            path.push(record);
            current = undefined;
            open = true
          "
        >
          {{ tr('新增下级') }}
        </Button>
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
        <Button v-if="can('move')" type="link" size="small" @click="move(record)">
          {{ tr('移动') }}
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
                api.updateUnitStatus(record.id, {
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
    :title="tr(current ? '编辑组织' : '新增组织')"
    :columns="fields"
    :initial="current ? { ...current } : { sort: 0 }"
    :save="save"
  />
  <SchemaDialog
    v-model:open="moveOpen"
    :title="tr('移动组织')"
    :columns="moveFields"
    :initial="{ parentId: current?.parentId ?? '' }"
    :save="saveMove"
  />
  <AssignmentDialog
    v-model:open="assignOpen"
    :scope="organizationScope"
    kind="unit"
    :target="current"
    @saved="table?.reload()"
  />
</template>
