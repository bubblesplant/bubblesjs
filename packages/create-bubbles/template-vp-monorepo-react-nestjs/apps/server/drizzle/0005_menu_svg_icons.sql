WITH source AS (
  SELECT
    id,
    scope_type,
    type,
    route_key,
    icon,
    icon IN ('', 'DashboardOutlined', 'ApartmentOutlined', 'UserOutlined', 'IdcardOutlined', 'SafetyOutlined', 'SafetyCertificateOutlined', 'MenuOutlined', 'AuditOutlined', 'HomeOutlined', 'ProfileOutlined', 'TeamOutlined', 'ProjectOutlined') AS is_legacy
  FROM menus
), desired AS (
  SELECT
    id,
    scope_type,
    icon,
    CASE
      WHEN type = 'page' AND is_legacy AND route_key IN ('platform.home') THEN 'dashboard'
      WHEN type = 'page' AND is_legacy AND route_key IN ('platform.companies') THEN 'companies'
      WHEN type = 'page' AND is_legacy AND route_key IN ('platform.accounts') THEN 'accounts'
      WHEN type = 'page' AND is_legacy AND route_key IN ('platform.roles', 'company.roles', 'project.roles') THEN 'roles'
      WHEN type = 'page' AND is_legacy AND route_key IN ('platform.menus') THEN 'menus'
      WHEN type = 'page' AND is_legacy AND route_key IN ('platform.audit', 'company.audit', 'project.audit') THEN 'audit-log'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.home', 'project.home') THEN 'home'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.profile', 'project.profile') THEN 'profile'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.members', 'project.members') THEN 'members'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.projects') THEN 'projects'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.organization', 'project.organization') THEN 'organization'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.positions') THEN 'positions'
      WHEN type = 'page' AND is_legacy AND route_key IN ('company.organization.templates') THEN 'organization-template'
      WHEN icon = 'DashboardOutlined' THEN 'dashboard'
      WHEN icon = 'ApartmentOutlined' THEN 'companies'
      WHEN icon IN ('UserOutlined', 'IdcardOutlined') THEN 'accounts'
      WHEN icon IN ('SafetyOutlined', 'SafetyCertificateOutlined') THEN 'roles'
      WHEN icon = 'MenuOutlined' THEN 'menus'
      WHEN icon = 'AuditOutlined' THEN 'audit-log'
      WHEN icon = 'HomeOutlined' THEN 'home'
      WHEN icon = 'ProfileOutlined' THEN 'profile'
      WHEN icon = 'TeamOutlined' THEN 'members'
      WHEN icon = 'ProjectOutlined' THEN 'projects'
      WHEN icon ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$' THEN icon
      ELSE ''
    END AS new_icon
  FROM source
), changed AS (
  UPDATE menus AS target
  SET icon = desired.new_icon, updated_at = now()
  FROM desired
  WHERE target.id = desired.id
    AND target.icon IS DISTINCT FROM desired.new_icon
  RETURNING target.scope_type
)
UPDATE menu_versions AS version
SET version = version.version + 1
FROM (SELECT DISTINCT scope_type FROM changed) AS affected
WHERE version.scope_type = affected.scope_type;
