<script setup lang="ts">
import type { VNode } from 'vue'
import { DownOutlined, KeyOutlined, LogoutOutlined } from '@antdv-next/icons'
import { useI18n } from '@bubblesjs/i18n-vue'
import { App, Avatar, Button, Dropdown } from 'antdv-next'
import { getRequestErrorMessage } from 'shared/utils'
import { computed, h, ref } from 'vue'
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
const menuOpen = ref(false)
const initial = computed(() => store.user?.name.slice(0, 1).toUpperCase() || 'W')
const roleLabel = computed(() =>
  store.access ? tr(store.access.administrator ? '管理员' : '成员') : undefined,
)
const columns = computed(() => [
  passwordField('oldPassword', tr('原密码')),
  passwordField('newPassword', tr('新密码')),
  passwordField('confirmPassword', tr('确认密码')),
])
/** 在账户操作菜单上方展示头像、当前账号及当前空间角色。 */
function renderMenu(menu: VNode) {
  return h('div', { class: 'workspace-account-panel' }, [
    h('div', { class: 'workspace-account-identity' }, [
      h(Avatar, { size: 40, 'aria-hidden': true }, () => initial.value),
      h('div', { class: 'workspace-account-details' }, [
        h('strong', store.user?.name || tr('访客')),
        h('span', store.user?.account),
        roleLabel.value ? h('small', roleLabel.value) : null,
      ]),
    ]),
    menu,
  ])
}

/** 收起菜单后打开改密弹窗或执行既有退出流程。 */
function selectAction({ key }: { key: string | number }) {
  menuOpen.value = false
  if (key === 'password') open.value = true
  if (key === 'logout') void signOut()
}
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
    v-model:open="menuOpen"
    :trigger="['click']"
    placement="bottomRight"
    auto-focus
    destroy-on-hidden
    :classes="{ root: 'workspace-account-dropdown' }"
    :popup-render="renderMenu"
    :menu="{
      items: [
        { key: 'password', label: tr('修改密码'), icon: () => h(KeyOutlined) },
        { type: 'divider' },
        { key: 'logout', label: tr('退出登录'), danger: true, icon: () => h(LogoutOutlined) },
      ],
      onClick: selectAction,
    }"
  >
    <Button
      type="text"
      class="workspace-account-trigger account-button"
      :aria-label="tr('账户菜单')"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
    >
      <Avatar :size="32" aria-hidden="true">{{ initial }}</Avatar>
      <span class="workspace-account-name" :title="store.user?.name">{{
        store.user?.name || tr('访客')
      }}</span>
      <DownOutlined class="workspace-account-chevron" aria-hidden="true" />
    </Button>
  </Dropdown>
  <SchemaDialog v-model:open="open" :title="tr('修改密码')" :columns="columns" :save="save" />
</template>
