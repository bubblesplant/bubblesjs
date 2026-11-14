import { useI18n } from '@bubblesjs/i18n-vue'
import { App } from 'antdv-next'
import { getAccessPermission, getRequestErrorMessage } from 'shared/utils'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { routeScope } from '@/router/access'
import { useUserStore } from '@/store/modules/user'
import { managementApi } from '@/views/access/api'
/** 提供当前路由绑定的接口与授权，仅在管理页使用。 */
export function useWorkspace() {
  const route = useRoute()
  const store = useUserStore()
  const scope = routeScope(route)!
  const api = managementApi(scope)
  const { message, modal } = App.useApp()
  const { tr } = useI18n()
  const routeKey = String(route.meta.routeKey)
  const title = computed(() => tr(String(route.meta.title)))
  /** 检查操作权限以及共享目录声明的管理员限制。 */
  function can(operation: string) {
    const key = operation.includes('.') ? operation : `${routeKey}.${operation}`
    const definition = getAccessPermission(key)
    return (
      !!store.access?.permissionKeys.includes(key) &&
      (!definition?.adminOnly || store.access.administrator === scope.type)
    )
  }
  /** 请求取消不提示，其余错误显示服务端的可读信息。 */
  function showError(error: unknown) {
    if ((error as Error)?.name !== 'AbortError')
      message.error(getRequestErrorMessage(error, tr('操作失败，请重试')))
  }
  /** 操作成功后刷新页面，失败时保留编辑内容。 */
  async function act(task: () => Promise<unknown>, reload?: () => unknown) {
    try {
      await task()
      message.success(tr('操作成功'))
      await reload?.()
      return true
    } catch (error) {
      showError(error)
      return false
    }
  }
  return {
    scope,
    api,
    store,
    routeKey,
    title,
    can,
    showError,
    act,
    message,
    modal,
    tr,
  }
}
