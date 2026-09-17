import type { AppErrorDefinition } from '@/common/exceptions/app.exception'

export const ACCESS_ERRORS = {
  FORBIDDEN: {
    code: 'ACCESS.FORBIDDEN',
    publicMessage: '当前工作空间无权执行此操作或已停用',
    status: 403,
  },
  NOT_FOUND: { code: 'ACCESS.NOT_FOUND', publicMessage: '资源不存在', status: 404 },
  INVALID_PERMISSION_SET: {
    code: 'ACCESS.INVALID_PERMISSION_SET',
    publicMessage: '权限集合不合法',
    status: 400,
  },
  INVALID_MENU_STRUCTURE: {
    code: 'ACCESS.INVALID_MENU_STRUCTURE',
    publicMessage: '菜单结构或功能绑定不合法',
    status: 400,
  },
  VERSION_CONFLICT: {
    code: 'ACCESS.VERSION_CONFLICT',
    publicMessage: '数据已被修改，请刷新后重试',
    status: 409,
  },
  DUPLICATE_RESOURCE: {
    code: 'ACCESS.DUPLICATE_RESOURCE',
    publicMessage: '编码、名称或成员已存在',
    status: 409,
  },
  LAST_ADMINISTRATOR: {
    code: 'ACCESS.LAST_ADMINISTRATOR',
    publicMessage: '必须保留至少一名有效管理员',
    status: 409,
  },
  BUILTIN_ROLE_IMMUTABLE: {
    code: 'ACCESS.BUILTIN_ROLE_IMMUTABLE',
    publicMessage: '内置角色由系统维护，不能修改或删除',
    status: 409,
  },
  RESOURCE_IN_USE: {
    code: 'ACCESS.RESOURCE_IN_USE',
    publicMessage: '资源仍被引用，请先解除引用',
    status: 409,
  },
  PROTECTED_MENU: {
    code: 'ACCESS.PROTECTED_MENU',
    publicMessage: '不能使管理恢复入口失效',
    status: 409,
  },
  CLEANUP_BLOCKED: {
    code: 'ACCESS.CLEANUP_BLOCKED',
    publicMessage: '废弃权限或部署条件不满足清理要求',
    status: 409,
  },
  ALREADY_INITIALIZED: {
    code: 'ACCESS.ALREADY_INITIALIZED',
    publicMessage: '平台已经初始化，不能更换初始管理员参数',
    status: 409,
  },
  INVALID_MEMBER_ACCOUNT: {
    code: 'ACCESS.INVALID_MEMBER_ACCOUNT',
    publicMessage: '账号不可用或不满足成员条件',
    status: 422,
  },
  MEMBER_INVITATION_NOT_FOUND: {
    code: 'ACCESS.MEMBER_INVITATION_NOT_FOUND',
    publicMessage: '邀请不存在或链接无效',
    status: 404,
  },
  MEMBER_INVITATION_EXPIRED: {
    code: 'ACCESS.MEMBER_INVITATION_EXPIRED',
    publicMessage: '邀请已过期，请联系企业管理员重新生成',
    status: 410,
  },
  MEMBER_INVITATION_REVOKED: {
    code: 'ACCESS.MEMBER_INVITATION_REVOKED',
    publicMessage: '邀请已被撤销',
    status: 410,
  },
  MEMBER_INVITATION_ALREADY_ACCEPTED: {
    code: 'ACCESS.MEMBER_INVITATION_ALREADY_ACCEPTED',
    publicMessage: '邀请已被其他账号使用',
    status: 409,
  },
  MEMBER_INVITATION_MEMBER_EXISTS: {
    code: 'ACCESS.MEMBER_INVITATION_MEMBER_EXISTS',
    publicMessage: '当前账号已经是该企业成员',
    status: 409,
  },
  MEMBER_INVITATION_NOT_PENDING: {
    code: 'ACCESS.MEMBER_INVITATION_NOT_PENDING',
    publicMessage: '当前邀请状态不允许执行此操作',
    status: 409,
  },
  ORGANIZATION_CYCLE: {
    code: 'ACCESS.ORGANIZATION_CYCLE',
    publicMessage: '不能把资源移动到自身或其后代节点',
    status: 409,
  },
  ORGANIZATION_DEPTH_EXCEEDED: {
    code: 'ACCESS.ORGANIZATION_DEPTH_EXCEEDED',
    publicMessage: '组织层级不能超过 10 层',
    status: 409,
  },
  ORGANIZATION_LEADER_CONFLICT: {
    code: 'ACCESS.ORGANIZATION_LEADER_CONFLICT',
    publicMessage: '同一组织单元最多只能有一名主要负责人',
    status: 409,
  },
  ORGANIZATION_SORT_EXHAUSTED: {
    code: 'ACCESS.ORGANIZATION_SORT_EXHAUSTED',
    publicMessage: '同级排序值已用尽，请先调整现有顺序',
    status: 409,
  },
  INVALID_MEMBER_RELATION: {
    code: 'ACCESS.INVALID_MEMBER_RELATION',
    publicMessage: '成员、组织或岗位状态不允许建立该关系',
    status: 422,
  },
  TEMPLATE_VERSION_CONFLICT: {
    code: 'ACCESS.TEMPLATE_VERSION_CONFLICT',
    publicMessage: '组织模板版本已变化，请刷新后重试',
    status: 409,
  },
  TEMPLATE_UNAVAILABLE: {
    code: 'ACCESS.TEMPLATE_UNAVAILABLE',
    publicMessage: '当前组织模板不可用于项目初始化',
    status: 422,
  },
} as const satisfies Record<string, AppErrorDefinition>
