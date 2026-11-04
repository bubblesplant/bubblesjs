import type {
  GlobalAccountResolver,
  GlobalAccountSelectProps,
  OrganizationMemberSelectProps,
} from '@/components/Selector'
import type { createSelectorExampleData } from './data'

/** 本地分页与补查保持公共选择器的异步协议，不访问业务接口。 */
export function createSelectorExampleRequests(data: ReturnType<typeof createSelectorExampleData>) {
  const accountRequest: GlobalAccountSelectProps['request'] = async (input) => {
    input.signal.throwIfAborted()
    const query = input.query.toLocaleLowerCase()
    const items = data.accounts.filter((row) =>
      `${row.name} ${row.account}`.toLocaleLowerCase().includes(query),
    )
    const start = (input.page - 1) * input.pageSize
    return { items: items.slice(start, start + input.pageSize), total: items.length }
  }
  const accountResolve: GlobalAccountResolver = async (ids, signal) => {
    signal.throwIfAborted()
    return data.accounts.filter((row) => ids.includes(row.userId))
  }
  const memberRequest: OrganizationMemberSelectProps['request'] = async (input) => {
    input.signal?.throwIfAborted()
    const query = input.query?.toLocaleLowerCase() ?? ''
    const items = data.members.filter((row) =>
      `${row.name} ${row.account}`.toLocaleLowerCase().includes(query),
    )
    const start = (input.page - 1) * input.pageSize
    return { items: items.slice(start, start + input.pageSize), total: items.length }
  }
  const memberResolve: OrganizationMemberSelectProps['resolve'] = async (ids) =>
    data.members.filter((row) => ids.includes(row.userId))
  return { accountRequest, accountResolve, memberRequest, memberResolve }
}
