<script setup lang="ts">
import type { MenuNode } from 'shared/types'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Button, Drawer, Menu, Spin } from 'antdv-next'
import { accessRoutePath, accessScopeKey } from 'shared/utils'
import { computed, h, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AccountMenu from '@/components/application/AccountMenu.vue'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import { firstAccessiblePath, navigationMenus, routeScope } from '@/router/access'
import { useUserStore } from '@/store/modules/user'

const store = useUserStore()
const route = useRoute()
const router = useRouter()
const { tr } = useI18n()
const drawer = ref(false)
const refreshing = ref(false)
const refreshFailed = ref(false)
const entry = computed(() =>
  store.workspaces.find(
    (item) =>
      accessScopeKey(item.scope) === (store.access ? accessScopeKey(store.access.scope) : ''),
  ),
)
const examples = computed(() => [
  {
    key: '/examples/pro-table',
    label: tr('ProTable 示例'),
  },
  {
    key: '/examples/pro-table/draft',
    label: tr('草稿编辑表格'),
  },
  {
    key: '/examples/i18n',
    label: tr('国际化示例'),
  },
  {
    key: '/examples/selector',
    label: tr('选择器示例'),
  },
])
/** 将已授权菜单转为 Antdv Menu 项，目录保留完整层级。 */
function menuItems(
  nodes: MenuNode[],
): Array<{ key: string; label: string; children?: ReturnType<typeof menuItems> }> {
  return nodes.map((node) => ({
    key:
      node.routeKey && store.access
        ? accessRoutePath({ scope: store.access.scope, routeKey: node.routeKey })!
        : node.id,
    label: tr(node.name),
    ...(node.type === 'directory'
      ? {
          children: menuItems(node.children),
        }
      : {}),
  }))
}
const items = computed(() => [
  ...(store.access ? menuItems(navigationMenus(store.access)) : []),
  {
    key: 'examples',
    label: tr('组件示例'),
    children: examples.value,
  },
])
/** 权限失效时隐藏旧内容，并重读授权后跳转至合法页面。 */
async function refresh() {
  const scope = routeScope(route)
  if (!scope || refreshing.value) return
  refreshing.value = true
  refreshFailed.value = false
  try {
    const access = await store.loadAccess(scope, true)
    if (!access.permissionKeys.includes(`${String(route.meta.routeKey)}.read`))
      await router.replace(firstAccessiblePath(access) ?? '/403')
  } catch {
    refreshFailed.value = true
  } finally {
    refreshing.value = false
  }
}
window.addEventListener('workspace-access-refresh', refresh)
onBeforeUnmount(() => window.removeEventListener('workspace-access-refresh', refresh))
/** 手机端导航后关闭抽屉。 */
function navigate({ key }: { key: string }) {
  if (key.startsWith('/')) {
    drawer.value = false
    void router.push(key)
  }
}
function sidebar() {
  return h(Menu, {
    mode: 'inline',
    items: items.value,
    selectedKeys: [route.path],
    defaultOpenKeys: ['examples'],
    onClick: navigate,
  })
}
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <RouterLink to="/workspaces" class="brand">
        <span class="brand-mark small">b.</span>
        Bubbles
      </RouterLink>
      <div class="space-label">
        <span>{{ tr('当前工作空间') }}</span>
        <strong>{{ entry?.name || tr('组件实验室') }}</strong>
      </div>
      <component :is="sidebar" />
      <div class="sidebar-bottom">
        <span class="status-dot" />
        {{ tr('有序工作，自在创造') }}
      </div>
    </aside>
    <Drawer v-model:open="drawer" placement="left" :size="260" :title="entry?.name || 'Bubbles'">
      <component :is="sidebar" />
    </Drawer>
    <div class="app-main">
      <header class="app-header">
        <div class="header-breadcrumb">
          <Button
            type="text"
            class="mobile-menu"
            :aria-label="tr('打开菜单')"
            @click="drawer = true"
          >
            ☰
          </Button>
          <span>{{ entry?.name || 'Bubbles' }}</span>
          <span>/</span>
          <strong>{{ tr(String(route.meta.title)) }}</strong>
        </div>
        <div class="header-actions">
          <Button @click="router.push('/workspaces')">{{ tr('切换空间') }}</Button>
          <LocaleSwitch />
          <AccountMenu v-if="store.user" />
          <Button v-else @click="router.push('/login')">
            {{ tr('登录') }}
          </Button>
        </div>
      </header>
      <main class="app-content">
        <Spin v-if="refreshing" class="page-spinner" />
        <Alert v-else-if="refreshFailed" type="error" :message="tr('权限加载失败')">
          <template #action>
            <Button @click="refresh">
              {{ tr('重试') }}
            </Button>
          </template>
        </Alert>
        <RouterView v-else v-slot="{ Component }">
          <component :is="Component" :key="route.path" />
        </RouterView>
      </main>
      <footer class="app-footer">BUBBLES · {{ tr('让协作自然发生') }}</footer>
    </div>
  </div>
</template>
