import { getRequestErrorMessage } from 'shared/utils'
import { App } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { AccessContext } from 'shared/types'
import { refreshAccess } from '@/utils/request/workspace'

/** 从父布局读取当前空间权限，保证页面与布局使用同一份数据。 */
export function useAccess() {
  return useOutletContext<AccessContext>()
}

/** 统一执行管理操作，处理取消、版本冲突提示及保存后的权限刷新。 */
export function useManagementAction() {
  const { message } = App.useApp()
  const { tr } = useI18n()
  return /** 执行管理请求并反馈结果，成功后刷新权限，冲突时提示重新加载。 */ async (
    action: () => Promise<unknown>,
    onSuccess?: () => void,
  ) => {
    try {
      await action()
      void message.success(tr('已保存'))
      onSuccess?.()
      refreshAccess()
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false
      const suffix =
        (error as { status?: number }).status === 409 ? tr(' 请刷新数据后检查最新内容再保存。') : ''
      void message.error(`${getRequestErrorMessage(error, tr('操作失败，请重试'))}${suffix}`)
      return false
    }
  }
}
