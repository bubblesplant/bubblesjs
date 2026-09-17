import { CopyOutlined, LinkOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, App, Button, Input, Modal, Space, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  CompanyMemberInvitationIssueResult,
  CompanyMemberInvitationRecord,
} from 'shared/types'
import type { managementApi } from '../../../api'
import { buildCompanyMemberInvitationLink } from './invitation-link'
import InvitationRecordsTable, { type InvitationAction } from './InvitationRecordsTable'

const PAGE_SIZE = 8

type ManagementApi = ReturnType<typeof managementApi>

export interface CompanyMemberInvitationDialogRef {
  show: () => void
  hide: () => void
}

/**
 * 管理企业一次性邀请：创建、查看状态、撤销及重发。
 * 原始邀请 token 只保存在当前弹窗会话中，关闭后立即清除。
 */
export default function CompanyMemberInvitationDialog({
  ref,
  api,
}: {
  ref: Ref<CompanyMemberInvitationDialogRef>
  api: ManagementApi
}) {
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState<CompanyMemberInvitationRecord[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionKey, setActionKey] = useState<string>()
  const [issuedLink, setIssuedLink] = useState<string>()
  const requestSequence = useRef(0)
  const dialogSession = useRef(0)
  const currentPage = useRef(1)
  const { message } = App.useApp()
  const { tr } = useI18n()

  useEffect(
    /** 组件卸载时废止全部在途响应，避免作用域切换后显示旧企业结果。 */ () => () => {
      dialogSession.current += 1
      requestSequence.current += 1
    },
    [],
  )

  /** 读取指定页邀请；弹窗关闭或新请求开始后忽略旧响应。 */
  async function loadInvitations(targetPage: number) {
    currentPage.current = targetPage
    const sequence = ++requestSequence.current
    setLoading(true)
    try {
      const result = await api.companyMemberInvitations({ page: targetPage, pageSize: PAGE_SIZE })
      if (sequence !== requestSequence.current) return
      setRecords(result.items)
      setTotal(result.total)
      setPage(result.page)
      currentPage.current = result.page
    } catch (cause) {
      if (sequence !== requestSequence.current) return
      setRecords([])
      setTotal(0)
      void message.error(cause instanceof Error ? cause.message : tr('无法加载邀请记录'))
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }

  /** 将新签发 token 转为完整链接，并替换上一次仅本地可见的链接。 */
  function revealIssuedLink(result: CompanyMemberInvitationIssueResult) {
    setIssuedLink(buildCompanyMemberInvitationLink(result.token))
  }

  /** 创建新的无账号绑定邀请，随后刷新状态列表。 */
  async function createInvitation() {
    if (creating) return
    const session = dialogSession.current
    setCreating(true)
    try {
      const result = await api.createCompanyMemberInvitation()
      if (session !== dialogSession.current) return
      revealIssuedLink(result)
      void message.success(tr('邀请链接已创建'))
      await loadInvitations(currentPage.current)
    } catch (cause) {
      if (session !== dialogSession.current) return
      void message.error(cause instanceof Error ? cause.message : tr('创建邀请失败，请重试'))
    } finally {
      if (session === dialogSession.current) setCreating(false)
    }
  }

  /** 按服务端状态约束撤销或重发邀请，重发成功时展示新的唯一链接。 */
  async function runInvitationAction({ kind, record }: InvitationAction) {
    const key = `${kind}:${record.id}`
    if (actionKey) return
    const session = dialogSession.current
    setActionKey(key)
    try {
      if (kind === 'revoke') {
        await api.revokeCompanyMemberInvitation(record.id, {
          expectedVersion: record.version,
        })
        if (session !== dialogSession.current) return
        void message.success(tr('邀请已撤销'))
      } else {
        const result = await api.resendCompanyMemberInvitation(record.id, {
          expectedVersion: record.version,
        })
        if (session !== dialogSession.current) return
        revealIssuedLink(result)
        void message.success(tr('新的邀请链接已生成'))
      }
      await loadInvitations(currentPage.current)
    } catch (cause) {
      if (session !== dialogSession.current) return
      void message.error(cause instanceof Error ? cause.message : tr('邀请操作失败，请重试'))
    } finally {
      if (session === dialogSession.current) setActionKey(undefined)
    }
  }

  /** 将本次签发的邀请链接写入浏览器剪贴板，并明确反馈权限或环境失败。 */
  async function copyIssuedLink() {
    if (!issuedLink) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(issuedLink)
      void message.success(tr('邀请链接已复制'))
    } catch {
      void message.error(tr('复制失败，请手动选择链接复制'))
    }
  }

  /** 关闭弹窗并清除无法再次从服务端读取的一次性原始链接。 */
  const hide = () => {
    dialogSession.current += 1
    requestSequence.current += 1
    setOpen(false)
    setLoading(false)
    setCreating(false)
    setActionKey(undefined)
    setIssuedLink(undefined)
    setRecords([])
    setTotal(0)
    setPage(1)
    currentPage.current = 1
  }

  useImperativeHandle(ref, () => ({
    /** 打开邀请管理弹窗并读取第一页最新记录。 */
    show: () => {
      dialogSession.current += 1
      requestSequence.current += 1
      currentPage.current = 1
      setRecords([])
      setTotal(0)
      setIssuedLink(undefined)
      setPage(1)
      setLoading(false)
      setCreating(false)
      setActionKey(undefined)
      setOpen(true)
      void loadInvitations(1)
    },
    hide,
  }))

  return (
    <Modal
      title={
        <Space>
          <MailOutlined />
          <span>{tr('邀请企业成员')}</span>
        </Space>
      }
      open={open}
      width={920}
      destroyOnHidden
      footer={<Button onClick={hide}>{tr('关闭')}</Button>}
      onCancel={hide}
    >
      <Alert
        type="info"
        showIcon
        title={tr('邀请链接不绑定账号')}
        description={tr('获得链接的人可在登录后主动确认加入企业；每条链接只可成功使用一次。')}
        style={{ marginBottom: 16 }}
      />

      {issuedLink && (
        <Alert
          type="warning"
          showIcon
          icon={<LinkOutlined />}
          title={tr('请立即复制本次生成的链接')}
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                {tr('出于安全考虑，关闭弹窗后无法再次查看此链接；需要时请重发生成新链接。')}
              </Typography.Text>
              <Space.Compact block>
                <Input.TextArea value={issuedLink} readOnly autoSize={{ minRows: 1, maxRows: 3 }} />
                <Button icon={<CopyOutlined />} onClick={() => void copyIssuedLink()}>
                  {tr('复制链接')}
                </Button>
              </Space.Compact>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {tr('邀请记录')}
        </Typography.Title>
        <Button
          type="primary"
          icon={<MailOutlined />}
          loading={creating}
          onClick={() => void createInvitation()}
        >
          {tr('创建邀请链接')}
        </Button>
      </Space>

      <InvitationRecordsTable
        records={records}
        loading={loading}
        page={page}
        total={total}
        actionKey={actionKey}
        onPageChange={(targetPage) => void loadInvitations(targetPage)}
        onAction={(action) => void runInvitationAction(action)}
      />
    </Modal>
  )
}
