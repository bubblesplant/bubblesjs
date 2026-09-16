import { randomUUID } from 'node:crypto'
import { AppException } from '@/common/exceptions/app.exception'
import { COMMON_ERRORS } from '@/common/error/common.error'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import type { OrganizationTemplatePositionInput, OrganizationTemplateUnitInput } from 'shared/types'
import {
  ORGANIZATION_MAX_DEPTH,
  normalizeOrganizationCode,
  normalizeOrganizationKey,
} from 'shared/utils'

export interface PreparedTemplateUnit {
  id: string
  parentId: string | null
  name: string
  nameKey: string
  code: string
  codeKey: string
  description: string
  sort: number
}

export interface PreparedTemplatePosition {
  id: string
  name: string
  nameKey: string
  code: string
  codeKey: string
  description: string
  status: 'active' | 'disabled'
}

/**
 * 校验一次模板定义中的父子引用、循环、深度和规范键唯一性，并生成待落库稳定 ID。
 *
 * clientKey 只在本次请求中解析父子关系，返回结果不再携带该临时字段。
 */
export function prepareTemplateDefinition(input: {
  units: OrganizationTemplateUnitInput[]
  positions: OrganizationTemplatePositionInput[]
}): { units: PreparedTemplateUnit[]; positions: PreparedTemplatePosition[] } {
  const byKey = new Map<string, OrganizationTemplateUnitInput>()
  for (const unit of input.units) {
    if (byKey.has(unit.clientKey)) throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
    byKey.set(unit.clientKey, unit)
  }
  for (const unit of input.units) {
    if (
      unit.parentClientKey === unit.clientKey ||
      (unit.parentClientKey !== null && !byKey.has(unit.parentClientKey))
    )
      throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
  }

  const depths = new Map<string, number>()
  const visiting = new Set<string>()
  /** 递归计算模板节点深度并识别任意长度的父引用循环。 */
  const depthOf = (clientKey: string): number => {
    const cached = depths.get(clientKey)
    if (cached) return cached
    if (visiting.has(clientKey)) throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
    visiting.add(clientKey)
    const unit = byKey.get(clientKey)!
    const depth = unit.parentClientKey ? depthOf(unit.parentClientKey) + 1 : 1
    visiting.delete(clientKey)
    depths.set(clientKey, depth)
    return depth
  }
  for (const key of byKey.keys()) {
    if (depthOf(key) > ORGANIZATION_MAX_DEPTH)
      throw new AppException(ACCESS_ERRORS.ORGANIZATION_DEPTH_EXCEEDED)
  }

  const codeKeys = new Set<string>()
  const siblingNameKeys = new Set<string>()
  for (const unit of input.units) {
    const codeKey = normalizeOrganizationCode(unit.code)
    const siblingNameKey = `${unit.parentClientKey ?? '<root>'}\u0000${normalizeOrganizationKey(unit.name)}`
    if (codeKeys.has(codeKey) || siblingNameKeys.has(siblingNameKey))
      throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
    codeKeys.add(codeKey)
    siblingNameKeys.add(siblingNameKey)
  }

  const positionNameKeys = new Set<string>()
  const positionCodeKeys = new Set<string>()
  for (const position of input.positions) {
    const nameKey = normalizeOrganizationKey(position.name)
    const codeKey = normalizeOrganizationCode(position.code)
    if (positionNameKeys.has(nameKey) || positionCodeKeys.has(codeKey))
      throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
    positionNameKeys.add(nameKey)
    positionCodeKeys.add(codeKey)
  }

  const ids = new Map(input.units.map((unit) => [unit.clientKey, randomUUID()]))
  return {
    units: input.units.map((unit) => ({
      id: ids.get(unit.clientKey)!,
      parentId: unit.parentClientKey ? ids.get(unit.parentClientKey)! : null,
      name: unit.name,
      nameKey: normalizeOrganizationKey(unit.name),
      code: unit.code,
      codeKey: normalizeOrganizationCode(unit.code),
      description: unit.description ?? '',
      sort: unit.sort,
    })),
    positions: input.positions.map((position) => ({
      id: randomUUID(),
      name: position.name,
      nameKey: normalizeOrganizationKey(position.name),
      code: position.code,
      codeKey: normalizeOrganizationCode(position.code),
      description: position.description ?? '',
      status: position.status,
    })),
  }
}

/** 为模板状态变更复制一份不可变子项快照，并为新版本重新映射父子 ID。 */
export function cloneTemplateSnapshot(input: {
  units: Array<{
    id: string
    parentId: string | null
    name: string
    nameKey: string
    code: string
    codeKey: string
    description: string
    sort: number
  }>
  positions: Array<{
    name: string
    nameKey: string
    code: string
    codeKey: string
    description: string
    status: 'active' | 'disabled'
  }>
}): { units: PreparedTemplateUnit[]; positions: PreparedTemplatePosition[] } {
  const ids = new Map(input.units.map((unit) => [unit.id, randomUUID()]))
  return {
    units: input.units.map((unit) => ({
      id: ids.get(unit.id)!,
      parentId: unit.parentId ? ids.get(unit.parentId)! : null,
      name: unit.name,
      nameKey: unit.nameKey,
      code: unit.code,
      codeKey: unit.codeKey,
      description: unit.description,
      sort: unit.sort,
    })),
    positions: input.positions.map((position) => ({
      id: randomUUID(),
      name: position.name,
      nameKey: position.nameKey,
      code: position.code,
      codeKey: position.codeKey,
      description: position.description,
      status: position.status,
    })),
  }
}
