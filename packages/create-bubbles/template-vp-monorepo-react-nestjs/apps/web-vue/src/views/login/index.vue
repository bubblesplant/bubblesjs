<script setup lang="ts">
import type { SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, App, Button } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import { buildAuthPath, safeNextPath } from '@/utils/safe-next'
import { cookie } from '@/utils/storage/cookie'
import { login } from './api'

const route = useRoute()
const router = useRouter()
const { tr } = useI18n()
const { message } = App.useApp()
const busy = ref(false)
const error = ref('')
const model = ref<Record<string, unknown>>({})
const columns = computed<SchemaFormColumn[]>(() => [
  {
    title: tr('账号'),
    dataIndex: 'account',
    fieldProps: {
      autocomplete: 'username',
      placeholder: tr('请输入账号'),
    },
    formItemProps: {
      rules: [
        {
          required: true,
          whitespace: true,
          message: tr('请输入账号'),
        },
      ],
    },
  },
  {
    title: tr('密码'),
    dataIndex: 'password',
    valueType: 'password',
    fieldProps: {
      autocomplete: 'current-password',
      placeholder: tr('请输入密码'),
    },
    formItemProps: {
      rules: [
        {
          required: true,
          message: tr('请输入密码'),
        },
      ],
    },
  },
])
/** 写入会话后进入安全的站内目标，密码不进入持久化存储。 */
async function submit(values: Record<string, unknown>) {
  if (busy.value) return false
  busy.value = true
  error.value = ''
  try {
    const result = await login({
      account: String(values.account).trim(),
      password: String(values.password),
    })
    cookie.set('token', result.accessToken, {
      expires: new Date(result.absoluteExpiresAt),
    })
    model.value.password = ''
    message.success(tr('登录成功'))
    await router.replace(safeNextPath(String(route.query.next ?? '/')))
    return true
  } catch (cause) {
    error.value = getRequestErrorMessage(cause, tr('登录失败，请重试'))
    return false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-language">
      <LocaleSwitch />
    </div>
    <section class="auth-story">
      <div class="brand-mark">b.</div>
      <span class="eyebrow">BUBBLES · WORKSPACE</span>
      <h1>
        {{ tr('让协作') }}
        <br />
        {{ tr('自然发生。') }}
      </h1>
      <p>{{ tr('连接团队与项目，构建属于你的工作空间。') }}</p>
      <div class="auth-orbit">
        <span />
        <span />
        <span />
      </div>
      <small>{{ tr('有序工作，自在创造') }}</small>
    </section>
    <section class="auth-panel">
      <div class="auth-form">
        <span class="eyebrow">WELCOME BACK</span>
        <h2>{{ tr('欢迎回来') }}</h2>
        <p>{{ tr('登录以继续使用工作空间') }}</p>
        <Alert
          v-if="route.query.registered"
          type="success"
          :message="tr('注册成功，请登录')"
          show-icon
        />
        <Alert v-if="error" type="error" :message="error" show-icon style="margin-bottom: 20px" />
        <SchemaForm
          v-model="model"
          :columns="columns"
          layout="vertical"
          :on-finish="submit"
          :submitter="{
            resetButtonProps: false,
            searchConfig: { submitText: tr('登录') },
            submitButtonProps: { block: true, loading: busy, size: 'large' },
          }"
        />
        <div class="auth-footer">
          {{ tr('还没有账号？') }}
          <RouterLink :to="buildAuthPath('/register', { next: String(route.query.next ?? '/') })">
            {{ tr('立即注册') }}
          </RouterLink>
        </div>
        <Button type="text" block @click="router.push('/examples/pro-table')">
          {{ tr('查看组件示例') }} ↗
        </Button>
      </div>
    </section>
  </div>
</template>
