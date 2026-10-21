import type { WorkspacesResult } from 'shared/types'
import { local } from '@/utils/storage/session'

/** 保留既有快照键，使 Zustand 迁移兼容已保存的空间展示数据。 */
export const WORKSPACES_STORAGE_KEY = 'workspace-display-cache'
const VERSION = 1

interface WorkspaceSnapshot {
  version: number
  userId: string
  savedAt: number
  workspaces: WorkspacesResult['workspaces']
}

/** 删除本功能的展示快照；存储不可用时仍允许正常登录和联网。 */
export function removeWorkspaceSnapshot() {
  try {
    local.remove(WORKSPACES_STORAGE_KEY)
  } catch {
    // 浏览器禁止存储时只使用内存。
  }
}

/** 校验不可信的本地结构，并重建白名单字段，避免恢复权限等额外属性。 */
export function readWorkspaceSnapshot(): WorkspaceSnapshot | undefined {
  try {
    const raw = local.get<WorkspaceSnapshot>(WORKSPACES_STORAGE_KEY)
    if (!raw) {
      removeWorkspaceSnapshot()
      return
    }
    if (
      raw.version !== VERSION ||
      typeof raw.userId !== 'string' ||
      !raw.userId ||
      !Number.isFinite(raw.savedAt) ||
      raw.savedAt <= 0 ||
      !Array.isArray(raw.workspaces)
    ) {
      removeWorkspaceSnapshot()
      return
    }
    const workspaces = raw.workspaces.map((entry) => {
      if (typeof entry.name !== 'string') throw new TypeError('无效的空间名称')
      const scope = entry.scope
      const companyId = 'companyId' in scope ? scope.companyId : undefined
      if (scope.type !== 'platform' && (typeof companyId !== 'string' || !companyId))
        throw new TypeError('无效的企业空间')
      if (scope.type === 'project' && (typeof scope.projectId !== 'string' || !scope.projectId))
        throw new TypeError('无效的项目空间')
      if (!['platform', 'company', 'project'].includes(scope.type))
        throw new TypeError('无效的空间类型')
      return {
        scope:
          scope.type === 'platform'
            ? { type: 'platform' as const }
            : scope.type === 'company'
              ? { type: 'company' as const, companyId: scope.companyId }
              : {
                  type: 'project' as const,
                  companyId: scope.companyId,
                  projectId: scope.projectId,
                },
        name: entry.name,
        ...(typeof entry.companyName === 'string' ? { companyName: entry.companyName } : {}),
        administrator: null,
      }
    })
    return { version: VERSION, userId: raw.userId, savedAt: raw.savedAt, workspaces }
  } catch {
    removeWorkspaceSnapshot()
    return
  }
}

/** 仅持久化账号归属和空间展示字段，禁止序列化完整 API 响应或权限状态。 */
export function saveWorkspaceSnapshot(data: WorkspacesResult, savedAt: number) {
  try {
    local.set(WORKSPACES_STORAGE_KEY, {
      version: VERSION,
      userId: data.user.id,
      savedAt,
      workspaces: data.workspaces.map(({ scope, name, companyName }) => ({
        scope:
          scope.type === 'platform'
            ? { type: scope.type }
            : scope.type === 'company'
              ? { type: scope.type, companyId: scope.companyId }
              : { type: scope.type, companyId: scope.companyId, projectId: scope.projectId },
        name,
        ...(companyName === undefined ? {} : { companyName }),
      })),
    })
  } catch {
    // 配额不足或隐私模式下继续使用已获取的内存结果。
  }
}
