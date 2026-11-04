import { organizationMemberCandidateQuerySchema } from 'shared/utils'
import type { OrganizationScope } from 'shared/types'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('../../src/utils/env', () => ({ envVariables: { API_AFFIX: '' } }))
vi.mock('../../src/utils/storage/cookie', () => ({ cookie: { get: () => 'query-test-session' } }))
vi.mock('../../src/utils/request/utils', () => ({ unAuthorizedResponseFunc: vi.fn() }))
vi.mock('antd', () => ({ message: { error: vi.fn() } }))

import { createAlovaInstanceFactory } from '../../src/utils/request/core'
import {
  clearWorkspaceRequests,
  enterWorkspace,
  workspaceRequest,
} from '../../src/utils/request/workspace'
import { organizationApi } from '../../src/pages/organization/api'
import { createRequestServer } from './fixtures'

const fixture = createRequestServer()
const request = createAlovaInstanceFactory({})
const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const arrayFields = ['organizationUnitIds', 'positionIds', 'roleIds', 'projectIds'] as const

beforeAll(async () => {
  await fixture.start()
  request.options.baseURL = fixture.baseURL
  workspaceRequest.options.baseURL = fixture.baseURL
})

beforeEach(() => {
  clearWorkspaceRequests()
  fixture.requests.length = 0
})

afterAll(() => fixture.close())

describe('数组 Query 的实际 HTTP 编码', () => {
  it.each(arrayFields)('%s 的单值和多值均可通过候选 Schema', async (field) => {
    for (const ids of [[firstId], [firstId, secondId]]) {
      await request.Get('/query', { params: { [field]: ids } })
      const received = fixture.requests.at(-1)!.query
      expect(Object.keys(received)).toEqual([field])
      expect(organizationMemberCandidateQuerySchema.parse(received)[field]).toEqual(ids)
    }
  })

  it('省略空数组及 undefined，同时保留 false、分页和特殊字符', async () => {
    await request.Get('/query', {
      params: {
        organizationUnitIds: [],
        positionIds: undefined,
        includeDisabled: false,
        page: 2,
        query: '研发 & A+B/测试',
      },
    })
    const received = fixture.requests.at(-1)!.query
    expect(received).toEqual({ includeDisabled: 'false', page: '2', query: '研发 & A+B/测试' })
    expect(organizationMemberCandidateQuerySchema.parse(received)).toMatchObject({
      includeDisabled: false,
      page: 2,
      query: '研发 & A+B/测试',
    })
  })

  it('单次请求仍可显式覆盖数组序列化规则', async () => {
    await request.Get('/query', {
      params: { organizationUnitIds: [firstId, secondId] },
      paramsSerializer: { indexes: false },
    })
    const received = fixture.requests.at(-1)!.query
    expect(received['organizationUnitIds[]']).toEqual([firstId, secondId])
    expect(organizationMemberCandidateQuerySchema.safeParse(received).success).toBe(false)
  })
})

const scopes: OrganizationScope[] = [
  { type: 'company', companyId: firstId },
  { type: 'project', companyId: firstId, projectId: secondId },
]

describe('组织页面 API 的工作空间请求', () => {
  it.each(scopes)('$type 组织页组合筛选保留全部 ID 并通过后端契约', async (scope) => {
    const key =
      scope.type === 'company'
        ? `company:${scope.companyId}`
        : `project:${scope.companyId}:${scope.projectId}`
    enterWorkspace(key)
    const params = {
      purpose: 'browseOrganization' as const,
      organizationUnitIds: [firstId],
      positionIds: [firstId, secondId],
      roleIds: [secondId],
      projectIds: [secondId],
      page: 1,
      pageSize: 20,
      includeDisabled: true,
    }
    await organizationApi(scope).memberCandidates(params)
    const received = fixture.requests.at(-1)!
    const base = `/companies/${firstId}${scope.type === 'project' ? `/projects/${secondId}` : ''}`
    expect(received.pathname).toBe(`${base}/organization/member-candidates`)
    expect(organizationMemberCandidateQuerySchema.parse(received.query)).toEqual(params)
  })
})
