<script setup lang="ts">
import type { SchemaFormColumn } from '@bubblesjs/antdv-next-pro'
import { SchemaForm } from '@bubblesjs/antdv-next-pro'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import { passwordField, textField } from '@/components/management/schema'
import { buildAuthPath } from '@/utils/safe-next'
import { register } from './api'

const router = useRouter()
const route = useRoute()
const { tr } = useI18n()
const busy = ref(false)
const error = ref('')
const model = ref<Record<string, unknown>>({})
const columns = computed<SchemaFormColumn[]>(() => [
  textField('name', tr('姓名')),
  textField('account', tr('账号')),
  passwordField('password', tr('密码')),
  {
    ...passwordField('confirmPassword', tr('确认密码')),
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
  <div class="auth-page">
    <div class="auth-language">
      <LocaleSwitch />
    </div>
    <section class="auth-story">
      <div class="brand-mark">b.</div>
      <span class="eyebrow">A NEW BEGINNING</span>
      <h1>
        {{ tr('从这里，') }}
        <br />
        {{ tr('开启新可能。') }}
      </h1>
      <p>{{ tr('一个账号，连接每一份协作。') }}</p>
      <div class="auth-orbit">
        <span />
        <span />
        <span />
      </div>
    </section>
    <section class="auth-panel">
      <div class="auth-form">
        <span class="eyebrow">JOIN BUBBLES</span>
        <h2>{{ tr('创建账号') }}</h2>
        <p>{{ tr('填写资料，开始使用工作空间') }}</p>
        <Alert v-if="error" type="error" :message="error" show-icon />
        <SchemaForm
          v-model="model"
          :columns="columns"
          layout="vertical"
          :on-finish="submit"
          :submitter="{
            resetButtonProps: false,
            searchConfig: { submitText: tr('注册') },
            submitButtonProps: { block: true, loading: busy, size: 'large' },
          }"
        />
        <div class="auth-footer">
          {{ tr('已有账号？') }}
          <RouterLink :to="buildAuthPath('/login', { next: String(route.query.next ?? '/') })">
            {{ tr('立即登录') }}
          </RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>
