import { ProFormSelect, type ProFormSelectProps } from '@ant-design/pro-components'
import { Typography } from 'antd'
import type { DictionaryOption, DictionaryReference } from 'shared/types'
import { getRequestErrorMessage, dictionaryKey } from 'shared/utils'
import { requestDictionaryOptions, useDictionaryStore } from '@/store/dictionary'

export type DictionarySelectProps = Omit<
  ProFormSelectProps<string | string[], DictionaryOption>,
  'request' | 'params' | 'options' | 'valueEnum' | 'cacheForSwr'
> &
  DictionaryReference

/** 通过统一 request 读取字典；响应失效和会话变化，打开时重读以落实 store 的 TTL。 */
export default function DictionarySelect({
  scope,
  code,
  fieldProps,
  ...props
}: DictionarySelectProps) {
  const key = dictionaryKey({ scope, code })
  const epoch = useDictionaryStore((state) => state.sessionEpoch)
  const revision = useDictionaryStore((state) => state.revisions[key] ?? 0)
  const [opened, setOpened] = useState(0)
  const [error, setError] = useState<string>()
  const identity = `${key}:${epoch}:${revision}`
  const latest = useRef(identity)
  latest.current = identity
  useEffect(() => setError(undefined), [identity])
  return (
    <ProFormSelect<string | string[], DictionaryOption>
      {...props}
      key={identity}
      cacheForSwr={false}
      showSearch={props.showSearch ?? true}
      params={{ scope, code, sessionEpoch: epoch, revision, opened }}
      request={
        /** 字段内部请求也遵守统一缓存；失败显示错误并允许再次打开重试。 */
        async (params) => {
          try {
            const items = await requestDictionaryOptions({ scope, code, keyWords: params.keyWords })
            if (latest.current === identity) setError(undefined)
            return items
          } catch (reason) {
            if (latest.current === identity && (reason as Error).name !== 'AbortError')
              setError(getRequestErrorMessage(reason, '字典加载失败，请重新打开重试'))
            throw reason
          }
        }
      }
      formItemProps={{
        ...props.formItemProps,
        validateStatus: error
          ? 'error'
          : (props.formItemProps?.validateStatus ?? props.validateStatus),
        // 当前 ProForm 对普通字段未透传 help；extra 可稳定展示加载失败并保留表单校验提示。
        extra: error ? (
          <Typography.Text type="danger" role="alert">
            {error}
          </Typography.Text>
        ) : (
          (props.formItemProps?.extra ?? props.extra)
        ),
      }}
      fieldProps={{
        ...fieldProps,
        onOpenChange: (open) => {
          if (open) setOpened((value) => value + 1)
          fieldProps?.onOpenChange?.(open)
        },
      }}
    />
  )
}
