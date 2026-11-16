<script setup lang="ts">
import type { SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@antdv-next/icons'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, App } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import Brand from '@/components/brand/Brand.vue'
import { buildAuthPath, safeNextPath } from '@/utils/safe-next'
import { cookie } from '@/utils/storage/cookie'
import { login } from './api'
import '@/styles/auth/login.scss'

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
      prefix: h(UserOutlined),
      size: 'large',
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
      prefix: h(LockOutlined),
      size: 'large',
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
  <main class="login-page">
    <section class="login-brand-panel" :aria-label="tr('万物')">
      <Brand variant="auth" />
      <div class="login-story">
        <div class="login-orbit" aria-hidden="true">
          <span class="login-pearl" />
          <span class="login-orbit-ring" />
          <span class="login-orbit-satellite" />
        </div>
        <p class="login-eyebrow">WANWU</p>
        <h1>{{ tr('万物') }}</h1>
        <p class="login-story-caption">{{ tr('企业与项目工作空间') }}</p>
      </div>
      <div class="login-brand-footer">{{ tr('登录后，选择你的工作空间。') }}</div>
    </section>
    <section class="login-form-panel" aria-labelledby="login-title">
      <div class="login-locale-switch"><LocaleSwitch /></div>
      <div class="login-form-content">
        <p class="login-form-eyebrow">{{ tr('账号登录') }}</p>
        <h2 id="login-title">{{ tr('欢迎回到万物') }}</h2>
        <p class="login-description">{{ tr('登录账号，进入你的工作空间。') }}</p>
        <Alert
          v-if="route.query.registered"
          class="login-error"
          type="success"
          :message="tr('账号已创建，请登录后继续。')"
          show-icon
        />
        <Alert
          v-if="error"
          class="login-error"
          type="error"
          :message="error"
          show-icon
          role="alert"
        />
        <SchemaForm
          v-model="model"
          :columns="columns"
          layout="vertical"
          :form-props="{ requiredMark: false }"
          :on-finish="submit"
          :submitter="{
            resetButtonProps: false,
            searchConfig: { submitText: tr('登录') },
            submitButtonProps: {
              block: true,
              loading: busy,
              size: 'large',
              icon: h(ArrowRightOutlined),
              iconPlacement: 'end',
            },
          }"
        />
        <p class="login-account-hint">
          {{ tr('还没有账号？') }}
          <RouterLink :to="buildAuthPath('/register', { next: String(route.query.next ?? '/') })">
            {{ tr('注册账号') }}
          </RouterLink>
        </p>
      </div>
      <footer class="login-footer">{{ tr('万物 · 工作空间') }}</footer>
    </section>
  </main>
</template>
