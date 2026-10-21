import type {
  DictionaryItem,
  DictionaryOption,
  DictionaryOptionsQuery,
  DictionaryReference,
} from '../../types'

/** 用固定元组生成无分隔符歧义的精确归属键，不隐式继承同编码字典。 */
export function dictionaryKey({ scope, code }: DictionaryReference): string {
  return JSON.stringify([
    scope.type,
    scope.type === 'platform' ? null : scope.companyId,
    scope.type === 'project' ? scope.projectId : null,
    code,
  ])
}

/** 将业务读取 query 转为既有访问作用域，不带入当前页面的工作空间。 */
export function dictionaryReference(query: DictionaryOptionsQuery): DictionaryReference {
  const scope =
    query.scopeType === 'platform'
      ? { type: 'platform' as const }
      : query.scopeType === 'company'
        ? { type: 'company' as const, companyId: query.companyId }
        : { type: 'project' as const, companyId: query.companyId, projectId: query.projectId }
  return { scope, code: query.code }
}

/** 仅返回启用项，按排序值及稳定业务值排序；不改变保存的原数组。 */
export function activeDictionaryOptions(items: DictionaryItem[]): DictionaryOption[] {
  return items
    .filter((item) => item.status === 'active')
    .sort((a, b) => a.sort - b.sort || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .map(({ label, value }) => ({ label, value }))
}

/** 已保存业务值不能移除或改名；停用保留历史值的可解释性。 */
export function preservesDictionaryValues(input: {
  before: DictionaryItem[]
  after: DictionaryItem[]
}): boolean {
  const values = new Set(input.after.map((item) => item.value))
  return input.before.every((item) => values.has(item.value))
}
