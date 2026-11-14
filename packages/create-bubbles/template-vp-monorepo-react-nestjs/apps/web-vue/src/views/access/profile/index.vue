<script setup lang="ts">
import type { SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import type { CompanyDetail, ProjectDetail } from 'shared/types'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { Alert, Button, Spin, Tag } from 'antdv-next'
import { onMounted, ref } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { descriptionField, textField } from '@/components/management/schema'
import { useWorkspace } from '@/components/management/useWorkspace'

const { api, title, can, act, showError, tr } = useWorkspace()
const data = ref<CompanyDetail | ProjectDetail>()
const model = ref<Record<string, unknown>>({})
const loading = ref(true)
const failed = ref(false)
const columns: SchemaFormColumn[] = [
  textField('name', tr('名称')),
  textField('code', tr('编码')),
  { ...descriptionField, title: tr('说明') },
]
/** 读取服务端当前资料及乐观锁版本，失败显示可重试状态。 */
async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await api.profile()
    model.value = {
      name: data.value.name,
      code: data.value.code,
      description: data.value.description,
    }
  } catch (error) {
    failed.value = true
    showError(error)
  } finally {
    loading.value = false
  }
}
async function save(values: Record<string, unknown>) {
  return act(
    () =>
      api.updateProfile({
        expectedVersion: data.value!.version,
        name: String(values.name),
        code: String(values.code),
        description: String(values.description ?? ''),
      }),
    load,
  )
}
onMounted(load)
</script>

<template>
  <PageHeading :title="title" :description="tr('维护工作空间的基本信息。')" />
  <Spin v-if="loading" />
  <Alert v-else-if="failed" type="error" :message="tr('加载失败')">
    <template #action>
      <Button @click="load">
        {{ tr('重试') }}
      </Button>
    </template>
  </Alert>
  <div v-else class="panel" style="max-width: 760px">
    <Tag color="purple">{{ tr(data?.status === 'active' ? '启用' : '停用') }}</Tag>
    <SchemaForm
      v-model="model"
      :columns="columns"
      :readonly="!can('update')"
      :submitter="
        can('update')
          ? { resetButtonProps: false, searchConfig: { submitText: tr('保存') } }
          : false
      "
      :on-finish="save"
      layout="vertical"
    />
  </div>
</template>
