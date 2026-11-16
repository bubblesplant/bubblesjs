<script setup lang="ts">
import type { MenuNode } from 'shared/types'
import {
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SwapOutlined,
  TableOutlined,
  TranslationOutlined,
} from '@antdv-next/icons'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Button, Drawer, Menu, Spin } from 'antdv-next'
import { accessRoutePath, accessScopeKey } from 'shared/utils'
import { computed, h, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AccountMenu from '@/components/application/AccountMenu.vue'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import Brand from '@/components/brand/Brand.vue'
import NavigationIcon from '@/components/navigation/NavigationIcon.vue'
import { firstAccessiblePath, navigationMenus, routeScope } from '@/router/access'
import { useUserStore } from '@/store/modules/user'
import '@/styles/workspace/layout.css'

const store = useUserStore()
const route = useRoute()
const router = useRouter()
const { tr } = useI18n()
const drawer = ref(false)
const collapsed = ref(false)
const refreshing = ref(false)
const refreshFailed = ref(false)
const entry = computed(() =>
  store.workspaces.find(
    (item) =>
      accessScopeKey(item.scope) === (store.access ? accessScopeKey(store.access.scope) : ''),
  ),
)
const scopeName = computed(() =>
  tr(
    store.access?.scope.type === 'platform'
      ? '平台空间'
      : store.access?.scope.type === 'company'
        ? '企业空间'
        : store.access?.scope.type === 'project'
          ? '项目空间'
          : '组件示例',
  ),
)
const workspaceName = computed(() =>
  [entry.value?.companyName, entry.value?.name].filter(Boolean).join(' / '),
)
const workspaceLocation = computed(() => ({
  path: '/workspaces',
  state: { workspaceKey: store.access ? accessScopeKey(store.access.scope) : '' },
}))
const examples = computed(() => [
  {
    key: '/examples/pro-table',
    label: tr('ProTable 示例'),
    icon: () => h(TableOutlined),
  },
  {
    key: '/examples/pro-table/draft',
    label: tr('草稿编辑表格'),
    icon: () => h(TableOutlined),
  },
  {
    key: '/examples/i18n',
    label: tr('国际化示例'),
    icon: () => h(TranslationOutlined),
  },
  {
    key: '/examples/selector',
    label: tr('选择器示例'),
    icon: () => h(NavigationIcon, { name: 'menu-item' }),
  },
])
/** 将已授权菜单转为 Antdv Menu 项，目录保留完整层级。 */
function menuItems(nodes: MenuNode[]): Array<{
  key: string
  label: string
  icon: () => ReturnType<typeof h>
  children?: ReturnType<typeof menuItems>
}> {
  return nodes.map((node) => ({
    key:
      node.routeKey && store.access
        ? accessRoutePath({ scope: store.access.scope, routeKey: node.routeKey })!
        : node.id,
    label: tr(node.name),
    icon: () => h(NavigationIcon, { name: node.icon }),
    ...(node.type === 'directory'
      ? {
          children: menuItems(node.children),
        }
      : {}),
  }))
}
const items = computed(() =>
  store.access && route.meta.scopeType ? menuItems(navigationMenus(store.access)) : examples.value,
)
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
/** 为桌面和手机复用同一授权菜单，抽屉始终展示完整文字。 */
function sidebar(mobile = false) {
  return h(Menu, {
    mode: 'inline',
    items: items.value,
    selectedKeys: [route.path],
    inlineCollapsed: !mobile && collapsed.value,
    onClick: navigate,
  })
}
</script>

<template>
  <div class="workspace-layout" :class="{ 'workspace-layout-collapsed': collapsed }">
    <header class="workspace-header">
      <Button
        type="text"
        class="workspace-mobile-menu"
        :aria-label="tr('打开菜单')"
        @click="drawer = true"
      >
        <MenuOutlined />
      </Button>
      <Brand variant="workspace" to="/workspaces" :aria-label="tr('万物工作空间')" />
      <RouterLink
        :to="workspaceLocation"
        class="workspace-context"
        :class="`workspace-context-${store.access?.scope.type || 'platform'}`"
        :aria-label="tr('切换空间')"
        :title="`${scopeName} · ${workspaceName || scopeName} · ${tr('切换空间')}`"
      >
        <span class="workspace-context-dot" aria-hidden="true" />
        <span class="workspace-context-type">{{ scopeName }}</span>
        <strong class="workspace-context-name-full">{{ workspaceName || scopeName }}</strong>
        <strong class="workspace-context-name-compact">{{ entry?.name || scopeName }}</strong>
        <span class="workspace-context-divider" aria-hidden="true" />
        <SwapOutlined class="workspace-context-switch-icon" aria-hidden="true" />
        <span class="workspace-context-switch-label">{{ tr('切换空间') }}</span>
      </RouterLink>
      <div class="workspace-header-actions">
        <LocaleSwitch />
        <AccountMenu v-if="store.user" />
        <Button v-else @click="router.push('/login')">{{ tr('登录') }}</Button>
      </div>
    </header>
    <Drawer v-model:open="drawer" placement="left" :size="260" class="workspace-navigation-drawer">
      <template #title><Brand variant="workspace" to="/workspaces" /></template>
      <component :is="() => sidebar(true)" />
    </Drawer>
    <div class="workspace-mainframe">
      <aside class="workspace-sidebar">
        <div class="workspace-sidebar-menu"><component :is="() => sidebar()" /></div>
        <Button
          type="text"
          class="workspace-sidebar-collapse"
          :aria-label="tr(collapsed ? '展开菜单' : '收起菜单')"
          @click="collapsed = !collapsed"
        >
          <MenuUnfoldOutlined v-if="collapsed" />
          <MenuFoldOutlined v-else />
        </Button>
      </aside>
      <main class="workspace-body app-content">
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
    </div>
  </div>
</template>
