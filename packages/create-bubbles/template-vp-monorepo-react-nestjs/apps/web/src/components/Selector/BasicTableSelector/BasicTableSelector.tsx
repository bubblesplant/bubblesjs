import { ProTable, type ParamsType } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import { Alert, Button, Flex, Modal, Tag, Typography } from 'antd'
import { BasicTableSelectorSelection } from './BasicTableSelectorSelection'
import type { BasicTableSelectorProps } from './BasicTableSelectorTypes'

/** 在独立弹窗中展示分页表格，支持跨页选择和缺失记录补查。 */
export default function BasicTableSelector<
  T extends object,
  Params extends ParamsType = ParamsType,
  ValueType = 'text',
>({
  ref,
  title,
  rowKey,
  request,
  multiple = false,
  onChange,
  requestByKeys,
  labelRender,
  sidePanel,
  onTableChange,
  getCheckboxProps,
  modalProps,
  onLoad,
  onRequestError,
  pagination,
  scroll,
  ...tableProps
}: BasicTableSelectorProps<T, Params, ValueType>) {
  const { tr } = useI18n()
  const [session, setSession] = useState<{
    id: number
    selection: BasicTableSelectorSelection<T>
  }>()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const sessionId = useRef(0)
  const pendingId = useRef<number | null>(null)

  /** 结束当前选择会话，清除提交状态及错误，使旧异步结果失效。 */
  const hide = () => {
    sessionId.current += 1
    pendingId.current = null
    setSession(undefined)
    setConfirming(false)
    setError(undefined)
  }

  useEffect(
    () => () => {
      // 关闭、重开或卸载后，旧会话的异步补查不能提交到新会话。
      sessionId.current += 1
    },
    [],
  )

  useImperativeHandle(ref, () => ({
    /** 根据初始选中项开启新会话，并清除上一会话的提交和错误状态。 */
    show: (options = {}) => {
      const selection = new BasicTableSelectorSelection<T>({ ...options, rowKey, multiple })
      const id = ++sessionId.current
      pendingId.current = null
      setConfirming(false)
      setError(undefined)
      setSession({ id, selection })
    },
    hide,
  }))

  /** 仅更新当前且未提交的选择会话，并清除之前的错误提示。 */
  const changeSelection = (selection: BasicTableSelectorSelection<T>) => {
    if (!session || pendingId.current !== null || session.id !== sessionId.current) return
    setSession({ ...session, selection })
    setError(undefined)
  }

  /** 补齐选中记录后提交结果，并阻止旧会话和重复确认影响当前弹窗。 */
  const confirm = async () => {
    if (!session || pendingId.current !== null) return
    const { id, selection } = session
    pendingId.current = id
    setConfirming(true)
    setError(undefined)
    try {
      const resolved = await selection.resolve(requestByKeys)
      if (sessionId.current !== id) return
      await onChange([...resolved.value], resolved.rows)
      if (sessionId.current === id) hide()
    } catch (cause) {
      if (sessionId.current === id) {
        setError(tr(cause instanceof Error ? cause.message : '确认选择失败，请重试'))
      }
    } finally {
      if (sessionId.current === id) {
        pendingId.current = null
        setConfirming(false)
      }
    }
  }

  return (
    <Modal
      width={960}
      okText={tr('确定')}
      cancelText={tr('取消')}
      {...modalProps}
      title={title}
      open={!!session}
      destroyOnHidden
      onCancel={hide}
      onOk={() => void confirm()}
      confirmLoading={confirming}
      cancelButtonProps={{ disabled: confirming }}
      closable={!confirming}
      keyboard={!confirming}
      maskClosable={!confirming}
    >
      {session && (
        <Flex align="stretch" gap={16} wrap="wrap">
          {sidePanel}
          <div style={{ flex: '1 1 640px', minWidth: 0 }}>
            <Flex align="center" justify="space-between">
              <Typography.Text>
                {tr('已选择 {count} 项', { count: session.selection.value.length })}
              </Typography.Text>
              <Button
                type="link"
                disabled={confirming || !session.selection.value.length}
                onClick={() => changeSelection(session.selection.select({ value: [] }))}
              >
                {tr('清空选择')}
              </Button>
            </Flex>
            <Flex wrap gap={4} style={{ maxHeight: 96, overflowY: 'auto', marginBottom: 12 }}>
              {session.selection.value.map(
                /** 为选中键生成标签，已加载记录使用业务标签，其余显示原始键。 */ (key) => {
                  const row = session.selection.get(key)
                  return (
                    <Tag
                      key={`${typeof key}:${key}`}
                      closable={!confirming}
                      onClose={
                        /** 阻止标签默认关闭行为，并从当前会话选中键中移除该项。 */ (event) => {
                          event.preventDefault()
                          changeSelection(
                            session.selection.select({
                              value: session.selection.value.filter((value) => value !== key),
                            }),
                          )
                        }
                      }
                    >
                      {row && labelRender ? labelRender(row) : String(key)}
                    </Tag>
                  )
                },
              )}
            </Flex>
            {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
            <ProTable<T, Params, ValueType>
              key={session.id}
              search={{ labelWidth: 'auto' }}
              cardProps={false}
              options={{ reload: true, density: false, setting: false }}
              {...tableProps}
              rowKey={(row) => session.selection.keyOf(row)}
              request={request}
              onChange={onTableChange}
              editable={undefined}
              dataSource={undefined}
              defaultData={undefined}
              pagination={
                pagination === false
                  ? false
                  : { defaultPageSize: 10, showSizeChanger: true, ...pagination }
              }
              scroll={{ x: 'max-content', y: 360, ...scroll }}
              tableAlertRender={false}
              tableAlertOptionRender={false}
              onLoad={
                /** 仅将当前会话加载的记录补入已选快照，并转发加载完成通知。 */ (rows) => {
                  if (session.id !== sessionId.current) return
                  setError(undefined)
                  setSession((current) =>
                    current?.id === session.id
                      ? { ...current, selection: current.selection.remember(rows) }
                      : current,
                  )
                  onLoad?.(rows)
                }
              }
              onRequestError={
                /** 仅向当前选择会话展示加载错误，并转发请求失败通知。 */ (cause) => {
                  if (session.id !== sessionId.current) return
                  setError(cause.message || tr('加载选择数据失败，请刷新重试'))
                  onRequestError?.(cause)
                }
              }
              rowSelection={{
                type: session.selection.multiple ? 'checkbox' : 'radio',
                preserveSelectedRowKeys: true,
                selectedRowKeys: session.selection.value,
                /** 合并行禁选规则，并在确认过程中禁用选择控件。 */
                getCheckboxProps: (row) => {
                  const checkboxProps = getCheckboxProps?.(row)
                  return { ...checkboxProps, disabled: confirming || checkboxProps?.disabled }
                },
                onChange: (keys, rows) =>
                  changeSelection(session.selection.select({ value: keys, rows })),
              }}
            />
          </div>
        </Flex>
      )}
    </Modal>
  )
}
