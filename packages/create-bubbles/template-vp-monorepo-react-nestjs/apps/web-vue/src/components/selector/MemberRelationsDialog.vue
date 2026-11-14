<script setup lang="ts">
import type {
  MemberRecord,
  OrganizationDuty,
  OrganizationMemberCandidate,
  OrganizationScope,
  OrganizationUnitNode,
  PositionRecord,
} from 'shared/types'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, App, Button, Modal, Select, Spin } from 'antdv-next'
import {
  accessScopeKey,
  canAddOrganizationAssignment,
  canAddPositionAssignment,
  canChangeOrganizationDuty,
  getRequestErrorMessage,
} from 'shared/utils'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { organizationApi } from '@/views/organization/api'
import { positionsApi } from '@/views/positions/api'
import { loadPages, loadUnits } from './choices'

const props = defineProps<{
  scope: OrganizationScope
  member?: MemberRecord
  kind: 'organization' | 'positions'
}>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open')
const { tr } = useI18n()
const { message } = App.useApp()
const loading = ref(false)
const saving = ref(false)
const failed = ref(false)
const units = ref<OrganizationUnitNode[]>([])
const positions = ref<PositionRecord[]>([])
const selected = ref<string[]>([])
const duties = ref<Record<string, OrganizationDuty>>({})
const initialDuties = ref<Record<string, OrganizationDuty>>({})
const initialPositions = ref<string[]>([])
const candidate = ref<OrganizationMemberCandidate>()
const organization = organizationApi(props.scope)
const position = positionsApi(props.scope)
const options = computed(() =>
  props.kind === 'organization'
    ? units.value.map((unit) => ({
        value: unit.id,
        label: unit.fullPath || unit.name,
        disabled:
          initialDuties.value[unit.id] === undefined &&
          (!candidate.value ||
            !canAddOrganizationAssignment({
              candidate: candidate.value,
              scope: props.scope,
              unitEffective: unit.effective,
            })),
      }))
    : positions.value.map((item) => ({
        value: item.id,
        label: item.name,
        disabled:
          !initialPositions.value.includes(item.id) &&
          (!candidate.value ||
            !canAddPositionAssignment({
              candidate: candidate.value,
              scope: props.scope,
              positionActive: item.status === 'active',
            })),
      })),
)
const dutyOptions = computed(() => [
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
/** 按既有职责和有效状态限制可选职责，失效关系允许降级。 */
function optionsForDuty(id: string) {
  return dutyOptions.value.map((option) => ({
    ...option,
    disabled:
      !candidate.value ||
      !canChangeOrganizationDuty({
        candidate: candidate.value,
        scope: props.scope,
        unitEffective: units.value.find((unit) => unit.id === id)?.effective ?? false,
        initialDuty: initialDuties.value[id],
        nextDuty: option.value as OrganizationDuty,
      }),
  }))
}
/** 从候选快照回填当前关系；读取失败时禁止提交空集合。 */
async function load() {
  const { member, kind } = props
  if (!member) return
  const revision = ++generation
  loading.value = true
  failed.value = false
  try {
    const [record] = await (
      kind === 'organization' ? organization : position
    ).resolveMemberCandidates({
      userIds: [member.userId],
      purpose: kind === 'organization' ? 'browseOrganization' : 'assignPositionMembers',
    })
    if (!record) throw new Error(tr('成员当前不可见'))
    const identity = record.identities.find(
      (item) => accessScopeKey(item.scope) === accessScopeKey(props.scope),
    )
    if (kind === 'organization') {
      const all = await loadUnits(props.scope)
      if (revision !== generation) return
      units.value = all
      candidate.value = record
      selected.value = identity?.organizationUnits.map((item) => item.id) ?? []
      duties.value = Object.fromEntries(
        identity?.organizationUnits.map((item) => [item.id, item.duty]) ?? [],
      )
      initialDuties.value = { ...duties.value }
    } else {
      const all = await loadPages((page) => position.list({ page, pageSize: 100 }))
      if (revision !== generation) return
      positions.value = all
      candidate.value = record
      selected.value = identity?.positions.map((item) => item.id) ?? []
      initialPositions.value = [...selected.value]
    }
  } catch (error) {
    if (revision === generation) {
      failed.value = true
      message.error(getRequestErrorMessage(error, tr('加载失败')))
    }
  } finally {
    if (revision === generation) loading.value = false
  }
}
/** 提交前校验新增岗位与组织职责，再全量替换；失败保留编辑器。 */
async function save() {
  if (loading.value || failed.value || saving.value || !props.member) return
  const valid = selected.value.every((id) => {
    if (props.kind === 'positions' && initialPositions.value.includes(id)) return true
    if (!candidate.value) return false
    return props.kind === 'organization'
      ? canChangeOrganizationDuty({
          candidate: candidate.value,
          scope: props.scope,
          unitEffective: units.value.find((unit) => unit.id === id)?.effective ?? false,
          initialDuty: initialDuties.value[id],
          nextDuty: duties.value[id] ?? 'member',
        })
      : canAddPositionAssignment({
          candidate: candidate.value,
          scope: props.scope,
          positionActive: positions.value.find((item) => item.id === id)?.status === 'active',
        })
  })
  if (!valid) {
    message.error(tr('当前状态不允许新增或升级关联'))
    return
  }
  const revision = generation
  saving.value = true
  try {
    if (props.kind === 'organization') {
      await organization.replaceMemberUnits(props.member!.userId, {
        relations: selected.value.map((id) => ({
          organizationUnitId: id,
          duty: duties.value[id] ?? 'member',
        })),
      })
    } else {
      await position.replaceMemberPositions(props.member!.userId, { positionIds: selected.value })
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
watch([open, () => props.member?.userId, () => props.kind], ([value]) => {
  if (value) void load()
  else generation++
})
onBeforeUnmount(() => generation++)
</script>

<template>
  <Modal
    :open="open"
    :title="`${tr(kind === 'organization' ? '组织归属' : '岗位任职')} · ${member?.name}`"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: loading || failed }"
    :mask-closable="false"
    @cancel="!saving && (open = false)"
    @ok="save"
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
      <Select
        v-model:value="selected"
        mode="multiple"
        :options="options"
        show-search
        option-filter-prop="label"
        style="width: 100%"
        :placeholder="tr('请选择')"
      />
      <div v-if="kind === 'organization'" class="editor-list" style="margin-top: 20px">
        <div v-for="id in selected" :key="id" class="editor-row">
          <span style="flex: 1">{{ units.find((item) => item.id === id)?.fullPath }}</span>
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
