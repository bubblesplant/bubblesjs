<script setup lang="ts">
import type { ProColumns, ProTableInstance, SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import type {
  AccountRecord,
  MemberRecord,
  OrganizationMemberCandidate,
  OrganizationScope,
  RoleRecord,
} from 'shared/types'
import { MailOutlined, PlusOutlined, UserAddOutlined } from '@antdv-next/icons'
import { ProTable } from '@bubblesjs/antdv-next-pro'
import { Button, Popconfirm, Space, Tag, Tooltip } from 'antdv-next'
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { passwordField, statusEnum, textField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import CandidateSelect from '@/components/selector/CandidateSelect.vue'
import { loadPages } from '@/components/selector/choices'
import MemberRelationsDialog from '@/components/selector/MemberRelationsDialog.vue'
import { organizationApi } from '@/views/organization/api'

type Row = (AccountRecord | MemberRecord) &
  Record<string, unknown> & { candidate?: OrganizationMemberCandidate }
const { api, scope, store, can, act, showError, message, tr } = useWorkspace()
const platform = scope.type === 'platform'
const organizationScope = platform ? undefined : (scope as OrganizationScope)
const organization = organizationScope ? organizationApi(organizationScope) : undefined
const canReadOrganization = computed(() => !platform && can(`${scope.type}.organization.read`))
const title = computed(() =>
  tr(platform ? '全局账号' : scope.type === 'company' ? '企业成员' : '项目成员'),
)
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
    fieldProps: { placeholder: tr('搜索姓名或账号') },
  },
  {
    title: tr('姓名'),
    dataIndex: 'name',
    hideInSearch: true,
    width: 150,
    fixed: 'left',
  },
  {
    title: tr('完整账号'),
    dataIndex: 'account',
    hideInSearch: true,
    copyable: true,
    width: 180,
    fixed: 'left',
  },
  {
    title: tr(platform ? '账号状态' : '成员状态'),
    dataIndex: 'status',
    valueType: 'select',
    width: 100,
    valueEnum: {
      active: { text: tr('启用'), status: 'Success' },
      disabled: { text: tr('停用'), status: 'Default' },
      ...(platform ? { locked: { text: tr('锁定'), status: 'Warning' } } : {}),
    },
  },
  ...(!platform
    ? [
        {
          title: tr('账号状态'),
          dataIndex: 'accountStatus',
          hideInSearch: true,
          width: 100,
          valueEnum: statusEnum(tr),
        },
      ]
    : []),
  {
    title: tr(platform ? '平台角色' : '角色'),
    dataIndex: 'roleNames',
    hideInSearch: true,
    render: (_value, record) =>
      'roleNames' in record
        ? h(Space, { size: [0, 4], wrap: true }, () =>
            (record as MemberRecord).roleNames.map((name) => h(Tag, { key: name }, () => name)),
          )
        : tr('{count} 个角色', { count: (record as AccountRecord).platformRoleIds.length }),
  },
  ...(canReadOrganization.value
    ? [
        {
          title: tr('组织归属'),
          dataIndex: 'organizationUnits',
          hideInSearch: true,
          width: 220,
          render: (_value: unknown, record: Row) =>
            h(
              Space,
              { size: [0, 4], wrap: true },
              () =>
                record.candidate?.identities
                  .flatMap((identity) => identity.organizationUnits)
                  .map((unit) =>
                    h(Tag, { key: unit.membershipId, color: 'purple' }, () => unit.name),
                  ) ?? '—',
            ),
        },
        {
          title: tr('岗位'),
          dataIndex: 'positions',
          hideInSearch: true,
          width: 200,
          render: (_value: unknown, record: Row) =>
            h(
              Space,
              { size: [0, 4], wrap: true },
              () =>
                record.candidate?.identities
                  .flatMap((identity) => identity.positions)
                  .map((position) =>
                    h(Tag, { key: position.id, color: 'blue' }, () => position.name),
                  ) ?? '—',
            ),
        },
      ]
    : []),
  {
    title: tr('加入时间'),
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    hideInSearch: true,
    width: 180,
  },
  {
    title: tr('操作'),
    key: 'actions',
    valueType: 'option',
    width: platform ? 320 : 390,
    fixed: 'right',
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
/** 读取账号或成员及有权查看的组织岗位快照，转换为表格分页结果。 */
async function request(params: Record<string, unknown>) {
  const query = {
    page: Number(params.current ?? 1),
    pageSize: Number(params.pageSize ?? 20),
    query: params.query as string,
    status: params.status as 'active' | 'disabled',
  }
  const result = platform ? await api.accounts(query) : await api.members(query)
  const candidates =
    organization && canReadOrganization.value && result.items.length
      ? await organization.resolveMemberCandidates({
          userIds: result.items.map((item) => (item as MemberRecord).userId),
          purpose: 'browseOrganization',
        })
      : []
  const candidateByUserId = new Map(candidates.map((candidate) => [candidate.userId, candidate]))
  return {
    data: result.items.map((item) => ({
      ...item,
      candidate: platform ? undefined : candidateByUserId.get((item as MemberRecord).userId),
    })),
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
  <ProTable
    ref="table"
    class="adaptive-table"
    :header-title="title"
    :columns="columns"
    :search="{ labelWidth: 'auto' }"
    :request="request"
    row-key="id"
    :pagination="{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }"
    :scroll="{ x: 'max-content', y: 'auto' }"
    @request-error="showError"
  >
    <template #toolbar-actions>
      <Space v-if="!platform && can('add')" size="small">
        <Button type="primary" @click="open = true">
          <template #icon
            ><UserAddOutlined v-if="scope.type === 'company'" /><PlusOutlined v-else
          /></template>
          {{ tr(scope.type === 'company' ? '直接注册' : '添加成员') }}
        </Button>
        <Tooltip v-if="scope.type === 'company'" :title="tr('邀请流程尚待确认，暂不可用')">
          <span
            ><Button disabled
              ><template #icon><MailOutlined /></template>{{ tr('邀请成员（待确认）') }}</Button
            ></span
          >
        </Tooltip>
      </Space>
    </template>
    <template #cell-actions="{ record }">
      <Space wrap :size="4">
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
          {{ tr('编辑组织') }}
        </Button>
        <Button
          v-if="!platform && can(`${scope.type}.positions.assign`)"
          type="link"
          size="small"
          @click="relations(record, 'positions')"
        >
          {{ tr('编辑岗位') }}
        </Button>
        <Button v-if="can('roles')" type="link" size="small" @click="editRoles(record)">
          {{ tr('分配角色') }}
        </Button>
        <Button
          v-if="can('status')"
          type="link"
          size="small"
          :disabled="own(record)"
          :danger="record.status === 'active'"
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
