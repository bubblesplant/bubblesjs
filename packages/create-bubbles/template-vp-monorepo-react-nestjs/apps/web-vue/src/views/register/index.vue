<script setup lang="ts">
import type { SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import { ArrowRightOutlined } from '@antdv-next/icons'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import Brand from '@/components/brand/Brand.vue'
import { passwordField, textField } from '@/components/management/schema'
import { buildAuthPath } from '@/utils/safe-next'
import { register } from './api'
import '@/styles/auth/login.scss'

const router = useRouter()
const route = useRoute()
const { tr } = useI18n()
const busy = ref(false)
const error = ref('')
const model = ref<Record<string, unknown>>({})
const columns = computed<SchemaFormColumn[]>(() => [
  {
    ...textField('name', tr('姓名')),
    fieldProps: {
      autocomplete: 'name',
      maxLength: 100,
      size: 'large',
      placeholder: tr('请输入'),
    },
  },
  {
    ...textField('account', tr('账号')),
    extra: tr('4–32 位字母、数字或下划线。'),
    fieldProps: {
      autocomplete: 'username',
      maxLength: 32,
      size: 'large',
      placeholder: tr('请输入'),
    },
  },
  {
    ...passwordField('password', tr('密码')),
    fieldProps: {
      autocomplete: 'new-password',
      maxLength: 128,
      size: 'large',
      placeholder: tr('请输入'),
    },
  },
  {
    ...passwordField('confirmPassword', tr('确认密码')),
    fieldProps: {
      autocomplete: 'new-password',
      maxLength: 128,
      size: 'large',
      placeholder: tr('请输入'),
    },
    formItemProps: {
      rules: [
        {
          required: true,
          message: tr('请确认密码'),
        },
        {
          validator: async (_rule: unknown, value: string) => {
            if (value !== model.value.password) throw new Error(tr('两次输入的密码不一致'))
          },
        },
      ],
    },
  },
])
/** 注册仅创建账号；完成后返回登录页并保留安全的 next。 */
async function submit(values: Record<string, unknown>) {
  if (busy.value) return false
  busy.value = true
  error.value = ''
  try {
    await register({
      name: String(values.name).trim(),
      account: String(values.account).trim(),
      password: String(values.password),
    })
    model.value = {}
    await router.replace(
      buildAuthPath('/login', {
        next: String(route.query.next ?? '/'),
        registered: true,
      }),
    )
    return true
  } catch (cause) {
    error.value = getRequestErrorMessage(cause, tr('注册失败，请重试'))
    return false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="login-page login-page-register">
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
      <div class="login-brand-footer">{{ tr('一个账号，访问你加入的企业和项目。') }}</div>
    </section>
    <section class="login-form-panel" aria-labelledby="register-title">
      <div class="login-locale-switch"><LocaleSwitch /></div>
      <div class="login-form-content">
        <p class="login-form-eyebrow">{{ tr('加入万物') }}</p>
        <h2 id="register-title">{{ tr('创建账号') }}</h2>
        <p class="login-description">{{ tr('注册后登录，可查看已获授权的工作空间。') }}</p>
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
            searchConfig: { submitText: tr('注册账号') },
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
          {{ tr('已有账号？') }}
          <RouterLink :to="buildAuthPath('/login', { next: String(route.query.next ?? '/') })">
            {{ tr('返回登录') }}
          </RouterLink>
        </p>
      </div>
      <footer class="login-footer">{{ tr('万物 · 工作空间') }}</footer>
    </section>
  </main>
</template>
