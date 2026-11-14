<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'
import { Button, Result, Space } from 'antdv-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { safeNextPath } from '@/utils/safe-next'

const route = useRoute()
const router = useRouter()
const { tr } = useI18n()
const status = computed(() =>
  route.path === '/403' ? '403' : route.path === '/error' ? '500' : '404',
)
</script>

<template>
  <div class="result-page">
    <Result
      :status="status"
      :title="tr(String(route.meta.title))"
      :sub-title="
        tr(
          status === '403'
            ? '请切换工作空间或联系管理员。'
            : status === '500'
              ? '暂时无法读取数据，请稍后重试。'
              : '请检查地址或返回工作空间。',
        )
      "
    >
      <template #extra>
        <Space>
          <Button type="primary" @click="router.push('/workspaces')">
            {{ tr('返回工作空间') }}
          </Button>
          <Button
            v-if="status === '500'"
            @click="router.replace(safeNextPath(String(route.query.next ?? '/')))"
          >
            {{ tr('重试') }}
          </Button>
          <Button @click="router.push('/login')">
            {{ tr('登录') }}
          </Button>
        </Space>
      </template>
    </Result>
  </div>
</template>
