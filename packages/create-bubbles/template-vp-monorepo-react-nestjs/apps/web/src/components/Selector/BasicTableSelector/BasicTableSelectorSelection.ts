import type {
  BasicTableSelectorRowKey,
  BasicTableSelectorShowOptions,
} from './BasicTableSelectorTypes'

/** 表格选择器内部的会话快照。仅保留已选对象，不累积缓存所有访问过的页面。 */
export class BasicTableSelectorSelection<T extends object> {
  readonly value: Key[]
  readonly multiple: boolean
  readonly rowKey: BasicTableSelectorRowKey<T>
  private readonly records: Map<Key, T>

  /** 复制并去重初始选中键，校验单选约束且只保留选中记录。 */
  constructor(
    options: BasicTableSelectorShowOptions<T> & {
      multiple: boolean
      rowKey: BasicTableSelectorRowKey<T>
    },
  ) {
    this.value = [...new Set(options.value ?? [])]
    this.multiple = options.multiple
    this.rowKey = options.rowKey
    if (!this.multiple && this.value.length > 1) {
      throw new Error('BasicTableSelector 单选模式的 value 最多包含一个 key')
    }
    const selected = new Set(this.value)
    this.records = new Map()
    for (const row of options.selectedRows ?? []) {
      const key = this.keyOf(row)
      if (selected.has(key)) this.records.set(key, row)
    }
  }

  /** 按配置提取稳定行键，键类型不受支持时抛出错误。 */
  keyOf(row: T): Key {
    const key = typeof this.rowKey === 'function' ? this.rowKey(row) : row[this.rowKey]
    if (typeof key !== 'string' && typeof key !== 'number' && typeof key !== 'bigint') {
      throw new Error('BasicTableSelector rowKey 必须返回稳定的字符串或数字 key')
    }
    return key
  }

  /** 读取指定已选 key 对应的对象快照。 */
  get(key: Key) {
    return this.records.get(key)
  }

  /** 返回当前选中但尚未取得完整记录的键。 */
  get missingKeys() {
    return this.value.filter((key) => !this.records.has(key))
  }

  /** 按选中键顺序返回完整记录，记录缺失时拒绝生成不完整结果。 */
  get rows(): T[] {
    return this.value.map(
      /** 按选中键读取缓存记录，缺失时抛错避免提交不完整选择。 */ (key) => {
        const row = this.records.get(key)
        if (!row) throw new Error('部分已选数据尚未加载，请重新选择后重试')
        return row
      },
    )
  }

  /** 创建更新后的选择快照，合并已知记录并过滤尚未加载的空行。 */
  select(options: { value: readonly Key[]; rows?: readonly T[] }) {
    return new BasicTableSelectorSelection<T>({
      rowKey: this.rowKey,
      multiple: this.multiple,
      value: options.value,
      // Ant Table 在仅回显 key 时，selectedRows 可能包含尚未缓存的空项。
      selectedRows: [...this.records.values(), ...(options.rows ?? []).filter(Boolean)],
    })
  }

  /** 补充已选记录的内容，同时保留现有选中键及顺序。 */
  remember(rows: readonly T[]) {
    return this.select({ value: this.value, rows })
  }

  /** 按缺失键补查选中记录，仍有不可用记录时抛错阻止确认。 */
  async resolve(requestByKeys?: (keys: Key[]) => Promise<T[]>) {
    const missing = this.missingKeys
    if (!missing.length) return this
    if (!requestByKeys) throw new Error('部分已选数据尚未加载，请重新选择后重试')
    const resolved = this.remember(await requestByKeys(missing))
    if (resolved.missingKeys.length) {
      throw new Error('部分已选数据已不可用，请取消对应选择后重试')
    }
    return resolved
  }
}
