import type { AppErrorDefinition } from '@/common/exceptions/app.exception'

export const DICTIONARY_ERRORS = {
  NOT_FOUND: { code: 'DICTIONARY.NOT_FOUND', publicMessage: '字典不存在或已停用', status: 404 },
  CODE_EXISTS: {
    code: 'DICTIONARY.CODE_EXISTS',
    publicMessage: '当前归属下字典编码已存在',
    status: 409,
  },
  ITEM_VALUE_IMMUTABLE: {
    code: 'DICTIONARY.ITEM_VALUE_IMMUTABLE',
    publicMessage: '已保存的选项值不能修改或移除，请停用旧选项',
    status: 409,
  },
} as const satisfies Record<string, AppErrorDefinition>
