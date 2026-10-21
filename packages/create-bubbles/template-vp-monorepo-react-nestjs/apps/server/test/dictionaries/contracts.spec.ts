import { describe, expect, it } from 'vite-plus/test'
import { StandardSchemaValidationPipe } from '@nestjs/common'
import {
  activeDictionaryOptions,
  createDictionarySchema,
  dictionaryListQuerySchema,
  dictionaryOptionsQuerySchema,
  preservesDictionaryValues,
  updateDictionarySchema,
} from 'shared/utils'

const item = { value: 'm', label: '米', sort: 1, status: 'active' as const }
const body = { code: 'units', name: '计量单位', items: [item] }
describe('字典原生 Schema 与稳定值', () => {
  it('原生 Pipe 转换默认值、trim 与分页数字', async () => {
    const pipe = new StandardSchemaValidationPipe({ transform: true })
    await expect(
      pipe.transform({ ...body, name: ' 单位 ' }, { type: 'body', schema: createDictionarySchema }),
    ).resolves.toMatchObject({ name: '单位', status: 'active', description: '' })
    await expect(
      pipe.transform({ page: '2' }, { type: 'query', schema: dictionaryListQuerySchema }),
    ).resolves.toEqual({ page: 2, pageSize: 20 })
  })
  it('重复业务值包含 trim 后重复也拒绝', () => {
    expect(
      createDictionarySchema.safeParse({ ...body, items: [item, { ...item, value: ' m ' }] })
        .success,
    ).toBe(false)
  })
  it('拒绝非法编码、超长数组和非整数排序', () => {
    expect(createDictionarySchema.safeParse({ ...body, code: 'Invalid-Code' }).success).toBe(false)
    expect(
      createDictionarySchema.safeParse({
        ...body,
        items: Array.from({ length: 501 }, (_, i) => ({ ...item, value: String(i) })),
      }).success,
    ).toBe(false)
    expect(
      createDictionarySchema.safeParse({ ...body, items: [{ ...item, sort: 1.1 }] }).success,
    ).toBe(false)
  })
  it('更新不能夹带 code，也必须提供有效版本', () => {
    const { code: _code, ...fields } = body
    expect(updateDictionarySchema.safeParse({ ...body, expectedVersion: 1 }).success).toBe(false)
    expect(updateDictionarySchema.safeParse({ ...fields, expectedVersion: 0 }).success).toBe(false)
    expect(updateDictionarySchema.safeParse({ ...fields, expectedVersion: 1 }).success).toBe(true)
  })
  it('读取作用域严格匹配归属，不允许平台携带企业参数或项目缺归属', () => {
    expect(
      dictionaryOptionsQuerySchema.safeParse({ scopeType: 'platform', code: 'units' }).success,
    ).toBe(true)
    expect(
      dictionaryOptionsQuerySchema.safeParse({
        scopeType: 'platform',
        companyId: 'x',
        code: 'units',
      }).success,
    ).toBe(false)
    expect(
      dictionaryOptionsQuerySchema.safeParse({ scopeType: 'project', code: 'units' }).success,
    ).toBe(false)
    expect(
      dictionaryOptionsQuerySchema.safeParse({
        scopeType: 'company',
        companyId: 'bad',
        code: 'units',
      }).success,
    ).toBe(false)
  })
  it('启用项按排序和值稳定排序，全部停用合法返回空数组', () => {
    expect(
      activeDictionaryOptions([
        { ...item, value: 'z' },
        { ...item, value: 'a' },
        { ...item, value: 'first', sort: 0 },
        { ...item, value: 'hidden', status: 'disabled' },
      ]).map((i) => i.value),
    ).toEqual(['first', 'a', 'z'])
    expect(activeDictionaryOptions([{ ...item, status: 'disabled' }])).toEqual([])
  })
  it('历史值允许停用与新增，不允许删除或改值', () => {
    expect(
      preservesDictionaryValues({ before: [item], after: [{ ...item, status: 'disabled' }] }),
    ).toBe(true)
    expect(
      preservesDictionaryValues({ before: [item], after: [item, { ...item, value: 'cm' }] }),
    ).toBe(true)
    expect(preservesDictionaryValues({ before: [item], after: [] })).toBe(false)
    expect(
      preservesDictionaryValues({ before: [item], after: [{ ...item, value: 'changed' }] }),
    ).toBe(false)
  })
})
