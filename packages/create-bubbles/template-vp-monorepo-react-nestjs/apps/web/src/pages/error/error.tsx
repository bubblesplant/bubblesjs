import { getRequestErrorMessage } from 'shared/utils'
import { Button, Result, Space } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'

/** 根据路由错误状态展示访问失败原因、重试及返回入口。 */
export default function RouteError() {
  const error = useRouteError()
  const { tr } = useI18n()
  const revalidator = useRevalidator()
  const status = isRouteErrorResponse(error) ? error.status : (error as { status?: number })?.status
  const title =
    status === 403
      ? tr('暂无访问权限')
      : status === 404
        ? tr('页面或资源不存在')
        : tr('暂时无法加载')
  return (
    <Result
      status={status === 403 ? '403' : status === 404 ? '404' : 'error'}
      title={title}
      subTitle={
        status === 404
          ? tr('请检查地址，或返回工作空间重新选择。')
          : getRequestErrorMessage(error, tr('请重试；如果问题持续，请联系管理员。'))
      }
      extra={
        <Space>
          <Link to="/workspaces">
            <Button type="primary">{tr('返回工作空间')}</Button>
          </Link>
          <Button
            loading={revalidator.state === 'loading'}
            onClick={() => void revalidator.revalidate()}
          >
            {tr('重新加载')}
          </Button>
        </Space>
      }
    />
  )
}
