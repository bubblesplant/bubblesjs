interface LatestDialogRequestOptions<TResult> {
  targetId: string
  load: () => Promise<TResult>
  onSuccess: (result: TResult) => void
  onError: (error: unknown) => void
}

interface LatestDialogRequestController {
  run: <TResult>(options: LatestDialogRequestOptions<TResult>) => Promise<void>
  invalidate: () => void
}

interface LatestDialogRequestState {
  loadingId?: string
  run: LatestDialogRequestController['run']
}

/**
 * 创建只允许最新请求更新弹窗和 loading 的协调器。
 * 旧请求完成时会静默退出，既不会执行回调，也不会清除新请求的 loading。
 */
export function createLatestDialogRequestController(
  onLoadingChange: (targetId?: string) => void,
): LatestDialogRequestController {
  let sequence = 0

  return {
    async run<TResult>({
      targetId,
      load,
      onSuccess,
      onError,
    }: LatestDialogRequestOptions<TResult>) {
      const requestSequence = ++sequence
      onLoadingChange(targetId)
      try {
        const result = await load()
        if (requestSequence !== sequence) return
        onSuccess(result)
      } catch (error) {
        if (requestSequence !== sequence) return
        onError(error)
      } finally {
        if (requestSequence === sequence) onLoadingChange(undefined)
      }
    },
    invalidate() {
      sequence += 1
    },
  }
}

/**
 * 为异步弹窗请求提供“最后一次调用生效”语义。
 * 作用域变化或组件卸载时，尚未完成的请求会自动失效。
 */
export function useLatestDialogRequest(scopeKey: string): LatestDialogRequestState {
  const [loadingId, setLoadingId] = useState<string>()
  const controllerRef = useRef<LatestDialogRequestController | undefined>(undefined)
  if (!controllerRef.current) {
    controllerRef.current = createLatestDialogRequestController(setLoadingId)
  }

  useEffect(() => {
    controllerRef.current?.invalidate()
    setLoadingId(undefined)
    return () => controllerRef.current?.invalidate()
  }, [scopeKey])

  return { loadingId, run: controllerRef.current.run }
}
