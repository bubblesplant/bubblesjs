<script setup lang="ts">
import type {
  GlobalAccountCandidate,
  OrganizationDuty,
  OrganizationMemberCandidate,
  OrganizationScope,
} from 'shared/types'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, App, Button, Modal, Select, Spin } from 'antdv-next'
import {
  accessScopeKey,
  canAddPositionAssignment,
  canChangeOrganizationDuty,
  getRequestErrorMessage,
} from 'shared/utils'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { organizationApi } from '@/views/organization/api'
import { positionsApi } from '@/views/positions/api'
import CandidateSelect from './CandidateSelect.vue'
import { loadPages } from './choices'

const props = defineProps<{
  scope: OrganizationScope
  target?: { id: string; name: string; effective?: boolean; status?: string }
  kind: 'unit' | 'position'
}>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open')
const { tr } = useI18n()
const { message } = App.useApp()
const selected = ref<string[]>([])
const initialSelected = ref<string[]>([])
const labels = ref<Record<string, string>>({})
const duties = ref<Record<string, OrganizationDuty>>({})
const initialDuties = ref<Record<string, OrganizationDuty>>({})
const candidates = ref<Record<string, OrganizationMemberCandidate>>({})
const loading = ref(false)
const saving = ref(false)
const failed = ref(false)
const organization = organizationApi(props.scope)
const position = positionsApi(props.scope)
const options = computed(() => [
  {
    value: 'member',
    label: tr('成员'),
  },
  {
    value: 'leader',
    label: tr('负责人'),
  },
  {
    value: 'deputy',
    label: tr('副负责人'),
  },
])
let generation = 0
/** 回填已解析候选的名称和有效性，供新增人员职责选择使用。 */
function updateCandidates(records: Array<OrganizationMemberCandidate | GlobalAccountCandidate>) {
  for (const record of records) {
    labels.value[record.userId] = `${record.name} · ${record.account}`
    if ('identities' in record) candidates.value[record.userId] = record
  }
}
/** 既有失效关系只能保留或降级职责。 */
function optionsForDuty(userId: string) {
  const candidate = candidates.value[userId]
  return options.value.map((option) => ({
    ...option,
    disabled:
      !candidate ||
      !canChangeOrganizationDuty({
        candidate,
        scope: props.scope,
        unitEffective: props.target?.effective !== false,
        initialDuty: initialDuties.value[userId],
        nextDuty: option.value as OrganizationDuty,
      }),
  }))
}
/** 取得目标的全部既有成员，禁止未加载完成就提交替换。 */
async function load() {
  const { target, kind } = props
  if (!target) return
  const revision = ++generation
  loading.value = true
  failed.value = false
  try {
    const result = await loadPages((page) =>
      organization.memberCandidates({
        page,
        pageSize: 100,
        includeDisabled: true,
        purpose: kind === 'unit' ? 'browseOrganization' : 'assignPositionMembers',
        ...(kind === 'unit'
          ? {
              organizationUnitIds: [target.id],
            }
          : {
              positionIds: [target.id],
            }),
      }),
    )
    if (revision !== generation) return
    candidates.value = Object.fromEntries(result.map((item) => [item.userId, item]))
    selected.value = result.map((item) => item.userId)
    initialSelected.value = [...selected.value]
    labels.value = Object.fromEntries(
      result.map((item) => [item.userId, `${item.name} · ${item.account}`]),
    )
    duties.value = Object.fromEntries(
      result.map((item) => [
        item.userId,
        item.identities
          .find((identity) => accessScopeKey(identity.scope) === accessScopeKey(props.scope))
          ?.organizationUnits.find((unit) => unit.id === target.id)?.duty ?? 'member',
      ]),
    )
    initialDuties.value = { ...duties.value }
  } catch (error) {
    if (revision === generation) {
      failed.value = true
      message.error(getRequestErrorMessage(error, tr('加载失败')))
    }
  } finally {
    if (revision === generation) loading.value = false
  }
}
/** 提交前再次校验新增和职责变更，避免失效关系被程序化新增或升级。 */
async function save() {
  if (saving.value || failed.value || loading.value || !props.target) return
  const valid = selected.value.every((userId) => {
    const candidate = candidates.value[userId]
    if (props.kind === 'position' && initialSelected.value.includes(userId)) return true
    if (!candidate) return false
    return props.kind === 'unit'
      ? canChangeOrganizationDuty({
          candidate,
          scope: props.scope,
          unitEffective: props.target!.effective !== false,
          initialDuty: initialDuties.value[userId],
          nextDuty: duties.value[userId] ?? 'member',
        })
      : canAddPositionAssignment({
          candidate,
          scope: props.scope,
          positionActive: props.target!.status === 'active',
        })
  })
  if (!valid) {
    message.error(tr('当前状态不允许新增或升级关联'))
    return
  }
  const revision = generation
  saving.value = true
  try {
    if (props.kind === 'unit') {
      await organization.replaceUnitMembers(props.target!.id, {
        members: selected.value.map((userId) => ({
          userId,
          duty: duties.value[userId] ?? 'member',
        })),
      })
    } else {
      await position.replacePositionMembers(props.target!.id, { userIds: selected.value })
    }
    if (revision !== generation) return
    message.success(tr('操作成功'))
    open.value = false
    emit('saved')
  } catch (error) {
    message.error(getRequestErrorMessage(error, tr('操作失败，请重试')))
  } finally {
    saving.value = false
  }
}
watch([open, () => props.target?.id, () => props.kind], ([value]) => {
  if (value) void load()
  else generation++
})
onBeforeUnmount(() => generation++)
</script>

<template>
  <Modal
    :open="open"
    :title="`${tr('分配成员')} · ${target?.name}`"
    :width="680"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: loading || failed }"
    :mask-closable="false"
    @ok="save"
    @cancel="!saving && (open = false)"
  >
    <Spin v-if="loading" />
    <Alert v-else-if="failed" type="error" :message="tr('加载失败')">
      <template #action>
        <Button @click="load">
          {{ tr('重试') }}
        </Button>
      </template>
    </Alert>
    <template v-else>
      <CandidateSelect
        v-model="selected"
        multiple
        :scope="scope"
        :purpose="kind === 'unit' ? 'browseOrganization' : 'assignPositionMembers'"
        @candidates="updateCandidates"
      />
      <div v-if="kind === 'unit'" class="editor-list" style="margin-top: 20px">
        <div v-for="(id, index) in selected" :key="id" class="editor-row">
          <span style="flex: 1">{{ labels[id] || `${tr('新增成员')} ${index + 1}` }}</span>
          <Select
            :value="duties[id] ?? 'member'"
            :options="optionsForDuty(id)"
            style="width: 130px"
            @update:value="(value) => (duties[id] = value as OrganizationDuty)"
          />
        </div>
      </div>
      <p class="muted" style="margin-top: 16px">
        {{ tr('保存将完整替换当前关系，清空选择将移除所有关联。') }}
      </p>
    </template>
  </Modal>
</template>
