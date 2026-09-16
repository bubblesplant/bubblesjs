import { Select } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationMemberCandidate } from 'shared/types'
import OrganizationMemberBrowser from './OrganizationMemberBrowser'
import type {
  OrganizationMemberBrowserRef,
  OrganizationMemberSelectorProps,
} from './OrganizationMemberSelectorTypes'

/** 把单选或多选值统一转换为去重后的 userId 数组。 */
function normalizeValue(value: string | string[] | undefined, multiple: boolean) {
  if (multiple) return [...new Set(Array.isArray(value) ? value : value ? [value] : [])]
  const selected = Array.isArray(value) ? value[0] : value
  return selected ? [selected] : []
}

interface CandidateCache {
  contextKey: string
  candidateById: Map<string, OrganizationMemberCandidate>
}

/** 把业务传入的候选快照转换为按稳定 userId 索引的缓存。 */
function candidateMap(candidates?: readonly OrganizationMemberCandidate[]) {
  return new Map(candidates?.map((candidate) => [candidate.userId, candidate]))
}

/** Select 风格入口，点击后在弹窗中按组织、岗位、角色和项目浏览成员。 */
export default function OrganizationMemberSelector({
  value,
  candidateContextKey,
  scope,
  multiple = false,
  selectedCandidates,
  filters,
  request,
  resolve,
  getCandidateDisabled,
  onChange,
  placeholder,
  disabled,
  allowClear = true,
  ...selectProps
}: OrganizationMemberSelectorProps) {
  const { tr } = useI18n()
  const browserRef = useRef<OrganizationMemberBrowserRef>(null)
  const [candidateCache, setCandidateCache] = useState<CandidateCache>(() => ({
    contextKey: candidateContextKey,
    candidateById: candidateMap(selectedCandidates),
  }))
  const resolveRef = useRef(resolve)
  const resolveRequestRef = useRef({ sequence: 0, contextKey: '' })
  const userIds = normalizeValue(value, multiple)
  const userIdsKey = userIds.join('\u0000')
  const suppliedCandidateById = useMemo(
    () => candidateMap(selectedCandidates),
    [candidateContextKey, selectedCandidates],
  )
  const candidateById =
    candidateCache.contextKey === candidateContextKey
      ? candidateCache.candidateById
      : suppliedCandidateById
  resolveRef.current = resolve

  /** 合并业务传入的候选回显快照。 */
  useEffect(() => {
    const supplied = selectedCandidates ?? []
    setCandidateCache((current) => {
      const currentCandidates =
        current.contextKey === candidateContextKey ? current.candidateById : suppliedCandidateById
      let next: Map<string, OrganizationMemberCandidate> | undefined
      for (const candidate of supplied) {
        if (currentCandidates.get(candidate.userId) === candidate) continue
        next ??= new Map(currentCandidates)
        next.set(candidate.userId, candidate)
      }
      if (!next && current.contextKey === candidateContextKey) return current
      return { contextKey: candidateContextKey, candidateById: next ?? currentCandidates }
    })
  }, [candidateContextKey, selectedCandidates, suppliedCandidateById])

  /** 按需补查缺失候选，避免字段显示裸 userId。 */
  useEffect(() => {
    const missing = userIds.filter((userId) => !candidateById.has(userId))
    if (!missing.length) {
      resolveRequestRef.current = {
        sequence: resolveRequestRef.current.sequence + 1,
        contextKey: '',
      }
      return
    }
    const missingKey = [...missing].sort().join('\u0000')
    const contextKey = `${candidateContextKey}\u0001${userIdsKey}\u0001${missingKey}`
    const sequence = resolveRequestRef.current.sequence + 1
    resolveRequestRef.current = { sequence, contextKey }
    void resolveRef
      .current(missing)
      .then((rows) => {
        const activeRequest = resolveRequestRef.current
        if (
          activeRequest.sequence !== sequence ||
          activeRequest.contextKey !== contextKey ||
          !rows.length
        )
          return
        setCandidateCache((current) => {
          const currentCandidates =
            current.contextKey === candidateContextKey ? current.candidateById : candidateById
          let changed = false
          const next = new Map(currentCandidates)
          for (const candidate of rows) {
            if (currentCandidates.get(candidate.userId) !== candidate) changed = true
            next.set(candidate.userId, candidate)
          }
          if (!changed && current.contextKey === candidateContextKey) return current
          return { contextKey: candidateContextKey, candidateById: next }
        })
      })
      .catch(() => {
        const activeRequest = resolveRequestRef.current
        if (activeRequest.sequence === sequence && activeRequest.contextKey === contextKey) {
          resolveRequestRef.current = { sequence: sequence + 1, contextKey: '' }
        }
      })
    return () => {
      const activeRequest = resolveRequestRef.current
      if (activeRequest.sequence === sequence && activeRequest.contextKey === contextKey) {
        resolveRequestRef.current = { sequence: sequence + 1, contextKey: '' }
      }
    }
  }, [candidateById, candidateContextKey, userIdsKey])

  const options = userIds.map((userId) => {
    const candidate = candidateById.get(userId)
    return {
      value: userId,
      label: candidate ? `${candidate.name} · ${candidate.account}` : userId,
    }
  })

  /** 提交弹窗选择并缓存候选快照，表单值只保留稳定 userId。 */
  const confirm = (selectedUserIds: string[], candidates: OrganizationMemberCandidate[]) => {
    setCandidateCache((current) => {
      const currentCandidates =
        current.contextKey === candidateContextKey ? current.candidateById : candidateById
      const next = new Map(currentCandidates)
      for (const candidate of candidates) next.set(candidate.userId, candidate)
      return { contextKey: candidateContextKey, candidateById: next }
    })
    onChange?.(multiple ? selectedUserIds : selectedUserIds[0], candidates)
  }

  return (
    <>
      <Select
        {...selectProps}
        value={multiple ? userIds : userIds[0]}
        mode={multiple ? 'multiple' : undefined}
        options={options}
        open={false}
        showSearch={false}
        disabled={disabled}
        allowClear={allowClear}
        placeholder={placeholder ?? tr('请选择成员')}
        onClick={() => {
          if (!disabled)
            browserRef.current?.show(
              userIds,
              userIds
                .map((userId) => candidateById.get(userId))
                .filter((candidate): candidate is OrganizationMemberCandidate => !!candidate),
            )
        }}
        onChange={
          /** 允许通过清空按钮或多选标签删除立即更新受控表单值。 */ (nextValue) => {
            const nextIds = normalizeValue(nextValue, multiple)
            const rows = nextIds
              .map((userId) => candidateById.get(userId))
              .filter((candidate): candidate is OrganizationMemberCandidate => !!candidate)
            onChange?.(multiple ? nextIds : nextIds[0], rows)
          }
        }
      />
      <OrganizationMemberBrowser
        ref={browserRef}
        candidateContextKey={candidateContextKey}
        scope={scope}
        multiple={multiple}
        filters={filters}
        request={request}
        resolve={resolve}
        getCandidateDisabled={getCandidateDisabled}
        onConfirm={confirm}
      />
    </>
  )
}
