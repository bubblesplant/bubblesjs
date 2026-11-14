<script setup lang="ts">
import type { ProColumns } from '@bubblesjs/antdv-next-pro'
import type {
  CleanupPreview,
  CreateMenuRequest,
  FunctionCatalogResult,
  MenuNode,
  MenuTreeResult,
  ScopeType,
  UpdateMenuRequest,
} from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Tag,
} from 'antdv-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import { refreshAccess } from '@/utils/request/workspace'
import { menuApi } from './api'
import MenuDialog from './MenuDialog.vue'

type Row = MenuNode & Record<string, unknown> & { depth: number }
const { title, can, act, showError, tr } = useWorkspace()
const scopeType = ref<ScopeType>('platform')
const tree = ref<MenuTreeResult>()
const catalog = ref<FunctionCatalogResult>()
const loading = ref(false)
const error = ref(false)
const record = ref<MenuNode>()
const open = ref(false)
const query = ref('')
const status = ref<string>()
const preview = ref<CleanupPreview>()
const confirmed = ref(false)
const cleaning = ref(false)
const previewing = ref(false)
let generation = 0
onBeforeUnmount(() => {
  generation++
})
/** 同时加载树和功能目录，切换作用域时丢弃上一轮结果。 */
async function load() {
  const requestId = ++generation
  loading.value = true
  error.value = false
  tree.value = undefined
  catalog.value = undefined
  open.value = false
  try {
    const [nextTree, nextCatalog] = await Promise.all([
      menuApi.tree(scopeType.value),
      menuApi.catalog(scopeType.value),
    ])
    if (requestId === generation) {
      tree.value = nextTree
      catalog.value = nextCatalog
    }
  } catch (cause) {
    if (requestId === generation) {
      error.value = true
      showError(cause)
    }
  } finally {
    if (requestId === generation) loading.value = false
  }
}
watch(scopeType, load, { immediate: true })
/** 搜索保留匹配项的上级名称，便于识别层级位置。 */
function rows(nodes: MenuNode[], depth = 0): Row[] {
  return nodes.flatMap((node) => {
    const children = rows(node.children, depth + 1)
    const matches =
      (!query.value ||
        `${node.name} ${node.routeKey ?? ''} ${node.permissionKey ?? ''}`
          .toLowerCase()
          .includes(query.value.toLowerCase())) &&
      (!status.value || node.status === status.value)
    return matches || children.length ? [{ ...node, depth }, ...children] : []
  })
}
const data = computed(() => rows(tree.value?.items ?? []))
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('显示名称'),
    dataIndex: 'name',
  },
  {
    title: tr('节点类型'),
    dataIndex: 'type',
  },
  {
    title: tr('绑定功能'),
    key: 'binding',
  },
  {
    title: tr('排序'),
    dataIndex: 'sort',
  },
  {
    title: tr('状态'),
    key: 'status',
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: 160,
  },
])
/** 完成写入后使用返回树，再通知布局重新取权。 */
async function save(body: CreateMenuRequest | UpdateMenuRequest) {
  return act(async () => {
    tree.value = record.value
      ? await menuApi.update(record.value.id, body)
      : await menuApi.create(scopeType.value, body as CreateMenuRequest)
    refreshAccess()
  })
}
/** 先展示服务端计算的引用影响及阻断条件，确认后才可执行清理。 */
async function previewCleanup() {
  previewing.value = true
  try {
    preview.value = await menuApi.cleanupPreview()
    confirmed.value = false
  } catch (cause) {
    showError(cause)
  } finally {
    previewing.value = false
  }
}
const executable = computed(
  () =>
    !!preview.value?.eligible &&
    !!preview.value.proofDigest &&
    !!preview.value.items.length &&
    confirmed.value,
)
/** 用本次预览摘要提交，服务端会再次核对引用和发布条件。 */
async function cleanup() {
  if (!executable.value || cleaning.value || !preview.value?.proofDigest) return
  cleaning.value = true
  try {
    if (
      await act(() =>
        menuApi.cleanup({
          proofDigest: preview.value!.proofDigest!,
          permissionKeys: preview.value!.items.map((item) => item.permissionKey),
        }),
      )
    ) {
      preview.value = undefined
      refreshAccess()
      await load()
    }
  } finally {
    cleaning.value = false
  }
}
</script>

<template>
  <PageHeading
    :title="title"
    :description="tr('配置工作空间导航及已发布功能，权限始终由服务端校验。')"
  />
  <Segmented
    v-model:value="scopeType"
    :options="[
      { value: 'platform', label: tr('平台') },
      { value: 'company', label: tr('企业') },
      { value: 'project', label: tr('项目') },
    ]"
    style="margin-bottom: 20px"
  />
  <Alert v-if="error" type="error" :title="tr('无法加载菜单')" show-icon>
    <template #action>
      <Button @click="load">
        {{ tr('重试') }}
      </Button>
    </template>
  </Alert>
  <ProTable
    :columns="columns"
    :data-source="data"
    :loading="loading"
    row-key="id"
    :search="false"
    :pagination="false"
    :scroll="{ x: 1000 }"
    :expandable="{ childrenColumnName: '__children' }"
  >
    <template #toolbar-title>
      <Space wrap>
        <Input v-model:value="query" allow-clear :placeholder="tr('搜索')" style="width: 210px" />
        <Select
          v-model:value="status"
          :options="[
            { value: 'active', label: tr('启用') },
            { value: 'disabled', label: tr('停用') },
          ]"
          allow-clear
          :placeholder="tr('状态')"
          style="width: 110px"
        />
      </Space>
    </template>
    <template #toolbar-actions>
      <Button v-if="can('cleanup')" :loading="previewing" @click="previewCleanup">
        {{ tr('清理废弃权限') }}
      </Button>
      <Button
        v-if="can('create')"
        type="primary"
        :disabled="!tree || !catalog"
        @click="
          record = undefined;
          open = true
        "
      >
        ＋ {{ tr('新增菜单节点') }}
      </Button>
    </template>
    <template #cell-name="{ record: row }">
      <span :style="{ paddingLeft: `${row.depth * 20}px` }">
        {{ row.depth ? '↳ ' : '' }}{{ row.name }}
      </span>
      <Tag v-if="row.protected" style="margin-left: 8px" color="purple">
        {{ tr('受保护') }}
      </Tag>
    </template>
    <template #cell-type="{ record: row }">
      {{ tr(row.type === 'directory' ? '目录' : row.type === 'page' ? '页面' : '按钮 / 操作') }}
    </template>
    <template #cell-binding="{ record: row }">
      {{ row.permissionKey || row.routeKey || '—' }}
    </template>
    <template #cell-status="{ record: row }">
      <Tag :color="row.status === 'active' ? 'success' : 'default'">
        {{ tr(row.status === 'active' ? '启用' : '停用') }}
      </Tag>
      <Tag v-if="row.hidden">
        {{ tr('隐藏') }}
      </Tag>
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
      <Popconfirm
        v-if="can('delete') && !row.protected"
        :title="tr('确认删除菜单节点？')"
        @confirm="
          act(async () => {
            tree = await menuApi.remove(row.id, tree!.version)
            refreshAccess()
          })
        "
      >
        <Button danger type="link" size="small">
          {{ tr('删除') }}
        </Button>
      </Popconfirm>
    </template>
  </ProTable>
  <MenuDialog
    v-if="tree && catalog"
    v-model:open="open"
    :record="record"
    :tree="tree"
    :catalog="catalog"
    :save="save"
  />
  <Modal
    :open="!!preview"
    :title="tr('废弃权限清理预览')"
    :width="740"
    :mask-closable="false"
    :confirm-loading="cleaning"
    :ok-button-props="{ disabled: !executable, danger: true }"
    :ok-text="tr('确认清理废弃权限')"
    :cancel-text="tr('关闭')"
    @ok="cleanup"
    @cancel="!cleaning && (preview = undefined)"
  >
    <template v-if="preview">
      <Alert
        :type="preview.eligible ? 'warning' : 'info'"
        show-icon
        :title="
          tr(
            preview.eligible
              ? '执行后将清理这些权限及对应引用，请核对影响范围。'
              : '当前条件不满足，暂不能执行清理。',
          )
        "
      />
      <p v-for="reason in preview.blockedReasons" :key="reason">
        {{ reason }}
      </p>
      <p>
        {{ tr('权限') }} {{ preview.totals.permissions }} · {{ tr('菜单节点') }}
        {{ preview.totals.menus }} · {{ tr('角色授权引用') }} {{ preview.totals.roleAssignments }}
      </p>
      <div v-for="item in preview.items" :key="item.permissionKey" class="permission-row">
        <strong>{{ tr(item.title) }}</strong>
        <p class="muted">
          {{ item.permissionKey }} · {{ item.menuIds.length }} {{ tr('菜单节点') }} ·
          {{ item.roleCount }} {{ tr('角色') }}
        </p>
        <p v-for="reason in item.blockedReasons" :key="reason">
          {{ reason }}
        </p>
      </div>
      <Checkbox
        v-if="preview.items.length"
        v-model:checked="confirmed"
        :disabled="!preview.eligible"
      >
        {{ tr('我已核对影响范围，确认清理以上废弃权限。') }}
      </Checkbox>
      <p v-else>
        {{ tr('当前没有需要清理的废弃权限。') }}
      </p>
    </template>
  </Modal>
</template>
