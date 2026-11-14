<script setup lang="ts">
import type { SchemaFormColumn, SchemaFormInstance } from '@bubblesjs/antdv-next-pro'
import type {
  CreateMenuRequest,
  FunctionCatalogResult,
  MenuNode,
  MenuTreeResult,
  UpdateMenuRequest,
} from 'shared/types'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Modal } from 'antdv-next'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  record?: MenuNode
  tree: MenuTreeResult
  catalog: FunctionCatalogResult
  save: (body: CreateMenuRequest | UpdateMenuRequest) => Promise<boolean>
}>()
const open = defineModel<boolean>('open', { default: false })
const model = ref<Record<string, unknown>>({})
const saving = ref(false)
const form = ref<SchemaFormInstance>()
const { tr } = useI18n()
watch(open, (value) => {
  if (value) {
    model.value = props.record
      ? { ...props.record, parentId: props.record.parentId ?? '' }
      : {
          type: 'page',
          parentId: '',
          sort: 0,
          hidden: false,
          status: 'active',
        }
  }
})
/** 展平树用于父级筛选，不改变服务端层级。 */
function flatten(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}
const nodes = computed(() => flatten(props.tree.items))
const type = computed(() => props.record?.type ?? model.value.type)
const columns = computed<SchemaFormColumn[]>(() => {
  const descendants = new Set(props.record ? flatten([props.record]).map((node) => node.id) : [])
  const parent = nodes.value.find((node) => node.id === model.value.parentId)
  const availableParents = nodes.value.filter(
    (node) =>
      !descendants.has(node.id) &&
      (type.value === 'operation'
        ? node.type === 'page' && (!props.record || node.routeKey === props.record.routeKey)
        : node.type === 'directory'),
  )
  const required = {
    rules: [
      {
        required: true,
        message: tr('请选择'),
      },
    ],
  }
  const fields: SchemaFormColumn[] = []
  if (!props.record) {
    fields.push({
      title: tr('节点类型'),
      dataIndex: 'type',
      valueType: 'select',
      fieldProps: {
        options: [
          {
            value: 'directory',
            label: tr('目录'),
          },
          {
            value: 'page',
            label: tr('页面'),
          },
          {
            value: 'operation',
            label: tr('按钮 / 操作'),
          },
        ],
      },
      formItemProps: required,
    })
  }
  fields.push(
    {
      title: tr('显示名称'),
      dataIndex: 'name',
      fieldProps: { maxLength: 100 },
      formItemProps: {
        rules: [{ required: true, whitespace: true, max: 100 }],
      },
    },
    {
      title: tr('父级节点'),
      dataIndex: 'parentId',
      valueType: 'select',
      fieldProps: {
        disabled: props.record?.protected,
        options: [
          ...(type.value === 'operation'
            ? []
            : [
                {
                  value: '',
                  label: tr('根目录'),
                },
              ]),
          ...availableParents.map((node) => ({ value: node.id, label: node.name })),
        ],
        showSearch: true,
        optionFilterProp: 'label',
      },
      formItemProps: type.value === 'operation' ? required : undefined,
    },
  )
  if (!props.record && type.value === 'page') {
    fields.push({
      title: tr('绑定页面'),
      dataIndex: 'routeKey',
      valueType: 'select',
      fieldProps: {
        options: props.catalog.items
          .filter(
            (item) =>
              item.kind === 'page' &&
              !item.deprecated &&
              !nodes.value.some((node) => node.routeKey === item.routeKey && node.type === 'page'),
          )
          .map((item) => ({
            value: item.routeKey,
            label: tr(item.title),
          })),
      },
      formItemProps: required,
    })
  }
  if (!props.record && type.value === 'operation') {
    fields.push({
      title: tr('绑定操作'),
      dataIndex: 'permissionKey',
      valueType: 'select',
      fieldProps: {
        options: props.catalog.items
          .filter(
            (item) =>
              item.kind === 'operation' &&
              !item.deprecated &&
              item.routeKey === parent?.routeKey &&
              !nodes.value.some((node) => node.permissionKey === item.key),
          )
          .map((item) => ({
            value: item.key,
            label: tr(item.title),
          })),
      },
      formItemProps: required,
    })
  }
  fields.push(
    {
      title: tr('图标'),
      dataIndex: 'icon',
      valueType: 'select',
      fieldProps: {
        allowClear: true,
        options: Object.keys(import.meta.glob('/src/assets/icon/*.svg')).map((path) => {
          const name = path.split('/').at(-1)!.replace('.svg', '')
          return { value: name, label: name }
        }),
      },
    },
    {
      title: tr('排序'),
      dataIndex: 'sort',
      valueType: 'digit',
      fieldProps: { min: 0, max: 100000, precision: 0 },
    },
    {
      title: tr('隐藏导航'),
      dataIndex: 'hidden',
      valueType: 'switch',
      fieldProps: { disabled: props.record?.protected },
    },
    {
      title: tr('功能状态'),
      dataIndex: 'status',
      valueType: 'select',
      fieldProps: {
        disabled: props.record?.protected,
        options: [
          {
            value: 'active',
            label: tr('启用'),
          },
          {
            value: 'disabled',
            label: tr('停用'),
          },
        ],
      },
    },
  )
  return fields
})
watch(
  () => model.value.type,
  (value, old) => {
    if (old && value !== old && !props.record) {
      model.value.parentId = ''
      model.value.routeKey = undefined
      model.value.permissionKey = undefined
    }
  },
)
watch(
  () => model.value.parentId,
  (value, old) => {
    if (old !== undefined && value !== old && !props.record) model.value.permissionKey = undefined
  },
)
/** 已有节点不更换功能绑定；所有修改带同一份树版本。 */
async function submit() {
  if (saving.value) return
  try {
    const values = await form.value!.validate()
    const common: UpdateMenuRequest = {
      expectedVersion: props.tree.version,
      parentId: values.parentId ? String(values.parentId) : null,
      name: String(values.name).trim(),
      icon: props.record
        ? String(values.icon ?? '')
        : values.icon
          ? String(values.icon)
          : undefined,
      sort: Number(values.sort ?? 0),
      hidden: !!values.hidden,
      status: values.status as 'active' | 'disabled',
    }
    const body = props.record
      ? common
      : {
          ...common,
          parentId: common.parentId ?? null,
          name: common.name!,
          type: type.value as CreateMenuRequest['type'],
          ...(type.value === 'page'
            ? {
                routeKey: String(values.routeKey),
              }
            : type.value === 'operation'
              ? {
                  permissionKey: String(values.permissionKey),
                }
              : {}),
        }
    saving.value = true
    if (await props.save(body)) open.value = false
  } catch {
    /* 表单就地提示字段错误。 */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="tr(record ? '编辑菜单节点' : '新增菜单节点')"
    :width="620"
    :confirm-loading="saving"
    :mask-closable="false"
    destroy-on-hidden
    :ok-text="tr('保存菜单')"
    :cancel-text="tr('取消')"
    @ok="submit"
    @cancel="!saving && (open = false)"
  >
    <Alert
      v-if="record?.protected"
      style="margin-bottom: 18px"
      type="info"
      :title="tr('此节点属于受保护的管理入口，不能隐藏、停用或移到不可用位置。')"
      show-icon
    />
    <Alert
      v-if="record && record.type !== 'directory'"
      style="margin-bottom: 18px"
      type="info"
      :title="tr('已有节点不能更换绑定功能。')"
    />
    <SchemaForm
      v-if="open"
      ref="form"
      v-model="model"
      :columns="columns"
      :submitter="false"
      layout="vertical"
    />
    <p class="muted">
      {{ tr('隐藏只影响菜单展示，已授权用户仍可直接访问。') }}
      <br />
      {{ tr('停用会阻断节点及下级功能，管理员也受此限制。') }}
    </p>
  </Modal>
</template>
