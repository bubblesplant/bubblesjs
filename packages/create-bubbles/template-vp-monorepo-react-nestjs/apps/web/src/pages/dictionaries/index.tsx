import { getRequestErrorMessage } from 'shared/utils'
import { PlusOutlined } from '@ant-design/icons'
import { ProForm, type ActionType, type ProColumns } from '@ant-design/pro-components'
import { App, Button, Modal, Space, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CreateDictionaryRequest, DictionaryRecord, EntityStatus } from 'shared/types'
import FullHeightProTable from '@/components/FullHeightProTable/FullHeightProTable'
import DictionarySelect from '@/components/DictionarySelect/DictionarySelect'
import { dictionaryStore } from '@/store/dictionary'
import { useAccess } from '@/pages/access/use-access'
import { dictionaryApi } from './api'
import DictionaryFormDialog, {
  type DictionaryFormDialogRef,
} from './components/DictionaryFormDialog'

/** 在三个工作空间复用管理页，业务选项预览使用与业务表单相同的统一读取入口。 */
export default function DictionariesPage() {
  const access = useAccess()
  const api = dictionaryApi(access.scope)
  const { message } = App.useApp()
  const { tr } = useI18n()
  const actionRef = useRef<ActionType>(null)
  const formRef = useRef<DictionaryFormDialogRef>(null)
  const [preview, setPreview] = useState<DictionaryRecord>()
  const allowed = (action: string) =>
    access.permissionKeys.includes(`${access.scope.type}.dictionaries.${action}`) &&
    (access.scope.type !== 'platform' || access.administrator === 'platform')

  /** 保存后只失效对应字典，避免与权限无关的编辑导致全局授权重取。 */
  async function save(body: CreateDictionaryRequest, record?: DictionaryRecord): Promise<boolean> {
    try {
      if (record) {
        const { code: _code, ...fields } = body
        await api.update(record.id, { ...fields, expectedVersion: record.version })
      } else await api.create(body)
      dictionaryStore.getState().invalidate({ scope: access.scope, code: body.code })
      void actionRef.current?.reload()
      void message.success(tr('已保存'))
      return true
    } catch (error) {
      if ((error as Error).name !== 'AbortError')
        void message.error(getRequestErrorMessage(error, tr('保存失败，请重试')))
      return false
    }
  }

  const columns: ProColumns<DictionaryRecord>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索字典名称或编码') },
    },
    { title: tr('字典名称'), dataIndex: 'name', search: false, width: 180 },
    { title: tr('字典编码'), dataIndex: 'code', search: false, width: 200, copyable: true },
    { title: tr('说明'), dataIndex: 'description', search: false, ellipsis: true },
    { title: tr('选项数'), search: false, width: 90, render: (_, row) => row.items.length },
    {
      title: tr('状态'),
      dataIndex: 'status',
      valueType: 'select',
      width: 100,
      valueEnum: {
        active: { text: tr('启用'), status: 'Success' },
        disabled: { text: tr('停用'), status: 'Default' },
      },
      render: (_, row) => (
        <Tag color={row.status === 'active' ? 'green' : 'default'}>
          {row.status === 'active' ? tr('启用') : tr('停用')}
        </Tag>
      ),
    },
    {
      title: tr('更新时间'),
      dataIndex: 'updatedAt',
      valueType: 'dateTime',
      search: false,
      width: 170,
    },
    {
      title: tr('操作'),
      valueType: 'option',
      width: 180,
      render: (_, row) => (
        <Space>
          {allowed('update') && (
            <Button type="link" size="small" onClick={() => formRef.current?.show(row)}>
              {tr('编辑')}
            </Button>
          )}
          <Button
            type="link"
            size="small"
            disabled={row.status !== 'active'}
            onClick={() => setPreview(row)}
          >
            {tr('预览选项')}
          </Button>
        </Space>
      ),
    },
  ]
  return (
    <>
      <FullHeightProTable<DictionaryRecord>
        rowKey="id"
        actionRef={actionRef}
        headerTitle={tr('数据字典')}
        columns={columns}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
        request={
          /** 转换管理接口分页结果，并保留服务端参数校验。 */
          async (params) => {
            const result = await api.list({
              page: params.current,
              pageSize: params.pageSize,
              query: params.query as string | undefined,
              status: params.status as EntityStatus | undefined,
            })
            return { data: result.items, total: result.total, success: true }
          }
        }
        onRequestError={(error) => {
          if (error.name !== 'AbortError')
            void message.error(getRequestErrorMessage(error, error.message))
        }}
        toolBarRender={() =>
          allowed('create')
            ? [
                <Button
                  key="create"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => formRef.current?.show()}
                >
                  {tr('新增字典')}
                </Button>,
              ]
            : []
        }
      />
      <DictionaryFormDialog ref={formRef} onSave={save} />
      <Modal
        title={preview ? `${preview.name} · ${tr('选项预览')}` : tr('选项预览')}
        open={Boolean(preview)}
        onCancel={() => setPreview(undefined)}
        footer={null}
        destroyOnHidden
      >
        {preview && (
          <ProForm submitter={false} key={preview.id}>
            <DictionarySelect
              scope={preview.scope}
              code={preview.code}
              name="preview"
              label={tr('业务选项')}
            />
          </ProForm>
        )}
      </Modal>
    </>
  )
}
