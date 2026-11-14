<script setup lang="ts">
import type { ProColumns, ProTableInstance, SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import type { AccountRecord, MemberRecord, OrganizationScope, RoleRecord } from 'shared/types'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Button, Popconfirm, Space } from 'antdv-next'
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { passwordField, statusEnum, textField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import CandidateSelect from '@/components/selector/CandidateSelect.vue'
import { loadPages } from '@/components/selector/choices'
import MemberRelationsDialog from '@/components/selector/MemberRelationsDialog.vue'

type Row = (AccountRecord | MemberRecord) & Record<string, unknown>
const { api, scope, store, title, can, act, showError, message, tr } = useWorkspace()
const platform = scope.type === 'platform'
const organizationScope = platform ? undefined : (scope as OrganizationScope)
const table = ref<ProTableInstance<Row>>()
const open = ref(false)
const rolesOpen = ref(false)
const passwordOpen = ref(false)
const relationsOpen = ref(false)
const kind = ref<'organization' | 'positions'>('organization')
const current = ref<Row>()
const roles = ref<RoleRecord[]>([])
const roleIds = ref<string[]>([])
let roleRevision = 0
const columns = computed<ProColumns<Row>[]>(() => [
  {
    title: tr('搜索'),
    dataIndex: 'query',
    hideInTable: true,
  },
  {
    title: tr('姓名'),
    dataIndex: 'name',
    hideInSearch: true,
  },
  {
    title: tr('账号'),
    dataIndex: 'account',
    hideInSearch: true,
    copyable: true,
  },
  {
    title: tr('状态'),
    dataIndex: 'status',
    valueType: 'select',
    valueEnum: statusEnum(tr),
  },
  ...(!platform
    ? [
        {
          title: tr('角色'),
          dataIndex: 'roleNames',
          hideInSearch: true,
          renderText: (value: unknown) => (value as string[]).join('、'),
        },
      ]
    : []),
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
    width: platform ? 270 : 430,
  },
])
const addFields = computed<SchemaFormColumn[]>(() =>
  scope.type === 'company'
    ? [
        textField('name', tr('姓名')),
        textField('account', tr('账号')),
        passwordField('password', tr('初始密码')),
      ]
    : [
        {
          title: tr('企业成员'),
          dataIndex: 'userId',
          formItemProps: {
            rules: [
              {
                required: true,
                message: tr('请选择成员'),
              },
            ],
          },
          renderFormItem: (_column, context) =>
            h(CandidateSelect, {
              scope: { type: 'company', companyId: (scope as OrganizationScope).companyId },
              purpose: 'addProjectMember',
              modelValue: context.record.userId as string,
              'onUpdate:modelValue': context.update,
            }),
        },
      ],
)
const roleFields = computed<SchemaFormColumn[]>(() => [
  {
    title: tr('角色'),
    dataIndex: 'roleIds',
    valueType: 'select',
    fieldProps: {
      mode: 'multiple',
      options: roles.value.map((role) => ({
        value: role.id,
        label: role.name,
        disabled: !role.assignable && !roleIds.value.includes(role.id),
      })),
    },
  },
])
const passwordFields = computed(() => [
  passwordField('newPassword', tr('新密码')),
  passwordField('confirmPassword', tr('确认密码')),
])
/** 按当前空间读取账号或成员，并转换为 ProTable 分页结果。 */
async function request(params: Record<string, unknown>) {
  const query = {
    page: Number(params.current ?? 1),
    pageSize: Number(params.pageSize ?? 10),
    query: params.query as string,
    status: params.status as 'active' | 'disabled',
  }
  const result = platform ? await api.accounts(query) : await api.members(query)
  return {
    data: result.items.map((item) => ({ ...item })),
    total: result.total,
    success: true,
  }
}
/** 企业注册新账号，项目从所属企业添加已有成员。 */
async function save(values: Record<string, unknown>) {
  return act(
    () =>
      scope.type === 'company'
        ? api.registerCompanyMember({
            name: String(values.name),
            account: String(values.account),
            password: String(values.password),
          })
        : api.addProjectMember({
            userId: String(values.userId),
          }),
    () => table.value?.reload(),
  )
}
/** 加载全部可见角色，保留不可重新授予的既有角色。 */
async function editRoles(row: Row) {
  const startedAt = ++roleRevision
  try {
    const result = await loadPages((page) => api.roles({ page, pageSize: 100 }))
    if (startedAt !== roleRevision) return
    current.value = row
    roles.value = result
    roleIds.value =
      'platformRoleIds' in row
        ? (row as AccountRecord).platformRoleIds
        : (row as MemberRecord).roleIds
    rolesOpen.value = true
  } catch (error) {
    if (startedAt === roleRevision) showError(error)
  }
}
/** 替换角色集合，成员变更携带读取时的版本以检测并发冲突。 */
async function saveRoles(values: Record<string, unknown>) {
  const roleIds = (values.roleIds as string[]) ?? []
  return act(
    () =>
      platform
        ? api.accountRoles(current.value!.id, { roleIds })
        : api.memberRoles(current.value!.id, {
            roleIds,
            expectedVersion: (current.value as MemberRecord).version,
          }),
    () => table.value?.reload(),
  )
}
/** 密码确认一致后执行管理员重置，服务端负责撤销旧会话。 */
async function savePassword(values: Record<string, unknown>) {
  if (values.newPassword !== values.confirmPassword) {
    message.error(tr('两次输入的密码不一致'))
    return false
  }
  return act(() =>
    api.resetAccountPassword(current.value!.id, {
      newPassword: String(values.newPassword),
      confirmPassword: String(values.confirmPassword),
    }),
  )
}
/** 本人账号不可在全局账号页停用或重置，使用个人菜单修改密码。 */
function own(row: Row) {
  return platform && row.id === store.user?.id
}
function relations(row: Row, type: 'organization' | 'positions') {
  current.value = row
  kind.value = type
  relationsOpen.value = true
}
/** 更新账号或空间成员状态，成功后重新读取列表。 */
async function toggle(row: Row) {
  const status = row.status === 'active' ? 'disabled' : 'active'
  return act(
    () =>
      platform
        ? api.accountStatus(row.id, { status })
        : api.memberStatus(row.id, { status, expectedVersion: (row as MemberRecord).version }),
    () => table.value?.reload(),
  )
}
watch(
  [open, passwordOpen, relationsOpen],
  (values) => {
    if (values.some(Boolean)) roleRevision++
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => roleRevision++)
</script>

<template>
  <PageHeading :title="title" :description="tr('管理账号状态、空间成员、角色及组织归属。')" />
  <ProTable
    ref="table"
    :columns="columns"
    :request="request"
    row-key="id"
    :scroll="{ x: platform ? 1000 : 1250 }"
    @request-error="showError"
  >
    <template #toolbar-actions>
      <Button v-if="!platform && can('add')" type="primary" @click="open = true">
        ＋ {{ tr(scope.type === 'company' ? '注册企业成员' : '添加项目成员') }}
      </Button>
    </template>
    <template #cell-actions="{ record }">
      <Space wrap :size="0">
        <Button v-if="can('roles')" type="link" size="small" @click="editRoles(record)">
          {{ tr('分配角色') }}
        </Button>
        <Button
          v-if="
            !platform &&
            can(`${scope.type}.organization.read`) &&
            can(`${scope.type}.organization.assign`)
          "
          type="link"
          size="small"
          @click="relations(record, 'organization')"
        >
          {{ tr('组织归属') }}
        </Button>
        <Button
          v-if="!platform && can(`${scope.type}.positions.assign`)"
          type="link"
          size="small"
          @click="relations(record, 'positions')"
        >
          {{ tr('岗位任职') }}
        </Button>
        <Button
          v-if="can('status')"
          type="link"
          size="small"
          :disabled="own(record)"
          @click="toggle(record)"
        >
          {{ tr(record.status === 'active' ? '停用' : '启用') }}
        </Button>
        <Button
          v-if="platform && can('reset-password')"
          type="link"
          size="small"
          :disabled="own(record)"
          @click="
            current = record;
            passwordOpen = true
          "
        >
          {{ tr('重置密码') }}
        </Button>
        <Popconfirm
          v-if="!platform && can('remove')"
          :title="tr('确定移除成员？')"
          @confirm="
            act(
              () => api.removeMember(record.id, record.version),
              () => table?.reload(),
            )
          "
        >
          <Button type="link" danger size="small">
            {{ tr('移除') }}
          </Button>
        </Popconfirm>
      </Space>
    </template>
  </ProTable>
  <SchemaDialog v-model:open="open" :title="tr('添加成员')" :columns="addFields" :save="save" />
  <SchemaDialog
    v-model:open="rolesOpen"
    :title="`${tr('分配角色')} · ${current?.name}`"
    :columns="roleFields"
    :initial="{ roleIds }"
    :save="saveRoles"
  />
  <SchemaDialog
    v-model:open="passwordOpen"
    :title="`${tr('重置密码')} · ${current?.name}`"
    :columns="passwordFields"
    :save="savePassword"
  >
    <p class="muted">
      {{ tr('重置成功后将撤销该账号所有终端的会话。') }}
    </p>
  </SchemaDialog>
  <MemberRelationsDialog
    v-if="organizationScope"
    v-model:open="relationsOpen"
    :scope="organizationScope"
    :member="current as MemberRecord"
    :kind="kind"
    @saved="table?.reload()"
  />
</template>
