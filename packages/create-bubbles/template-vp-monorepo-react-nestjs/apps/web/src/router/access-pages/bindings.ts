export interface AccessPageComponent {
  moduleName: string
  leafPath?: string
}

/** 只绑定随 Web 发布的组件；路径、标题和权限统一来自共享页面目录。 */
export const pageComponents = {
  'platform.home': { moduleName: 'access', leafPath: 'home' },
  'platform.dictionaries': { moduleName: 'dictionaries' },
  'platform.companies': { moduleName: 'access', leafPath: 'entities' },
  'platform.accounts': { moduleName: 'access', leafPath: 'members' },
  'platform.roles': { moduleName: 'access', leafPath: 'roles' },
  'platform.menus': { moduleName: 'access/menus' },
  'platform.audit': { moduleName: 'access', leafPath: 'audit' },
  'company.home': { moduleName: 'access', leafPath: 'home' },
  'company.dictionaries': { moduleName: 'dictionaries' },
  'company.profile': { moduleName: 'access', leafPath: 'profile' },
  'company.members': { moduleName: 'access', leafPath: 'members' },
  'company.roles': { moduleName: 'access', leafPath: 'roles' },
  'company.organization': { moduleName: 'organization' },
  'company.positions': { moduleName: 'positions' },
  'company.organization.templates': { moduleName: 'organization-templates' },
  'company.projects': { moduleName: 'access', leafPath: 'entities' },
  'company.audit': { moduleName: 'access', leafPath: 'audit' },
  'project.home': { moduleName: 'access', leafPath: 'home' },
  'project.dictionaries': { moduleName: 'dictionaries' },
  'project.profile': { moduleName: 'access', leafPath: 'profile' },
  'project.members': { moduleName: 'access', leafPath: 'members' },
  'project.roles': { moduleName: 'access', leafPath: 'roles' },
  'project.organization': { moduleName: 'organization' },
  'project.positions': { moduleName: 'positions' },
  'project.audit': { moduleName: 'access', leafPath: 'audit' },
} as const satisfies Record<string, AccessPageComponent>
