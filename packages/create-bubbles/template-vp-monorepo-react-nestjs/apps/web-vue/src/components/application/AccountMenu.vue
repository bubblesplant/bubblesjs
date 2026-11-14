<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'
import { App, Button, Dropdown } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { changePassword, logout } from '@/api/auth'
import { passwordField } from '@/components/management/schema'
import SchemaDialog from '@/components/management/SchemaDialog.vue'
import { useUserStore } from '@/store/modules/user'
import { cookie } from '@/utils/storage/cookie'

const store = useUserStore()
const router = useRouter()
const { tr } = useI18n()
const { message } = App.useApp()
const open = ref(false)
const columns = computed(() => [
  passwordField('oldPassword', tr('原密码')),
  passwordField('newPassword', tr('新密码')),
  passwordField('confirmPassword', tr('确认密码')),
])
/** 改密成功后服务端已撤销会话，本端同步删除凭据。 */
async function save(values: Record<string, unknown>) {
  if (values.newPassword !== values.confirmPassword) {
    message.error(tr('两次输入的密码不一致'))
    return false
  }
  try {
    await changePassword({
      oldPassword: String(values.oldPassword),
      newPassword: String(values.newPassword),
      confirmPassword: String(values.confirmPassword),
    })
    cookie.remove('token')
    message.success(tr('密码修改成功，请重新登录'))
    await router.replace('/login')
    return true
  } catch (error) {
    message.error(getRequestErrorMessage(error, tr('操作失败，请重试')))
    return false
  }
}
/** 服务端确认退出后清理本地会话；失败允许用户重试。 */
async function signOut() {
  try {
    await logout()
    cookie.remove('token')
    await router.replace('/login')
  } catch (error) {
    message.error(getRequestErrorMessage(error, tr('退出失败，请重试')))
  }
}
</script>

<template>
  <Dropdown
    :menu="{
      items: [
        { key: 'password', label: tr('修改密码') },
        { key: 'logout', label: tr('退出登录'), danger: true },
      ],
      onClick: ({ key }) => (key === 'password' ? (open = true) : signOut()),
    }"
  >
    <Button type="text" class="account-button">
      <span class="avatar">{{ store.user?.name.slice(0, 1) || 'B' }}</span>
      <span>{{ store.user?.name || tr('访客') }}</span>
    </Button>
  </Dropdown>
  <SchemaDialog v-model:open="open" :title="tr('修改密码')" :columns="columns" :save="save" />
</template>
