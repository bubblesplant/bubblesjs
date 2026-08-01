<script lang="ts" setup>
import type { MenuProps } from 'antdv-next'

import type { MenuRouteRecordRawType } from '@/router/interface'

import SvgIcon from '@/components/Icon/svg-icon.vue'

import { menuRoutes } from '@/router/modules'

import Header from './header/index.vue'

const route = useRoute()
const router = useRouter()

const collapsed = ref(false)

const selectedKeys = computed(() => {
  const matched = route.matched.map(item => item.name)
  return matched.filter(Boolean) as string[]
})

const openKeys = ref<string[]>([])

watchEffect(() => {
  const matched = route.matched.map(item => item.name).filter(Boolean) as string[]
  if (matched.length > 1) {
    openKeys.value = [matched[0]]
  }
})

function handleMenuClick({ key }: { key: string }) {
  router.push({ name: key })
}

function renderIcon(icon?: string) {
  if (!icon)
    return null
  const isSvgIcon = icon.startsWith('svg-')
  if (isSvgIcon) {
    return h(SvgIcon, {
      icon: icon.replace('svg-', ''),
      style: { fontSize: '18px' },
    })
  }
  return null
}

function getMenuItems(routes: MenuRouteRecordRawType[]): NonNullable<MenuProps['items']> {
  return routes
    .filter(item => !item.meta?.hideInMenu)
    .map((item) => {
      const hasChildren = item.children && item.children.length > 0
      const key = String(item.name ?? item.path)
      const label = item.meta?.title ?? key
      if (hasChildren) {
        return {
          key,
          label,
          icon: renderIcon(item.meta?.icon),
          children: getMenuItems(item.children as MenuRouteRecordRawType[]),
        }
      }
      return {
        key,
        label,
        icon: renderIcon(item.meta?.icon),
      }
    })
}

const menuItems = computed(() => getMenuItems(menuRoutes))
</script>

<template>
  <ALayout class="h-screen">
    <ALayoutSider
      v-model:collapsed="collapsed"
      :trigger="null"
      collapsible
      :width="220"
      class="layout-sider"
    >
      <div class="logo flex-center gap-2 h-[var(--header-height)]">
        <SvgIcon icon="logo" class="text-2xl" />
        <span v-show="!collapsed" class="text-lg text-white font-bold">
          Vue Template
        </span>
      </div>
      <AMenu
        v-model:selected-keys="selectedKeys"
        v-model:open-keys="openKeys"
        :items="menuItems"
        theme="dark"
        mode="inline"
        @click="handleMenuClick"
      />
    </ALayoutSider>

    <ALayout>
      <ALayoutHeader class="layout-header px-4 flex items-center justify-between">
        <div class="flex gap-3 items-center">
          <AButton
            type="text"
            class="flex-center"
            @click="collapsed = !collapsed"
          >
            <SvgIcon
              :icon="collapsed ? 'menu-unfold' : 'menu-fold'"
              style="font-size: 18px"
            />
          </AButton>
        </div>
        <Header />
      </ALayoutHeader>

      <ALayoutContent class="layout-content p-4 overflow-auto">
        <RouterView />
      </ALayoutContent>
    </ALayout>
  </ALayout>
</template>

<style lang="scss" scoped>
.layout-sider {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: auto;
}

.layout-header {
  height: var(--header-height);
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  padding: 0;
}

.layout-content {
  min-height: calc(100vh - var(--header-height));
  background: #f5f5f5;
}
</style>
