import { Button, DatePicker, Space, Typography } from 'antd'
import { useI18n } from '@bubbles/i18n'
import type { AppLocale } from '@/i18n'

const delay = new Promise<void>((resolve) => setTimeout(resolve, 2000))
let resolved = false
void delay.then(() => (resolved = true))

const Home = () => {
  const { locale, loading, setLocale, t } = useI18n<AppLocale>()
  if (!resolved) throw delay

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white p-6">
      <Space direction="vertical" size={16}>
        <Space>
          <Button
            type={locale === 'zh-CN' ? 'primary' : 'default'}
            loading={loading}
            onClick={() => void setLocale('zh-CN')}
          >
            中文
          </Button>
          <Button
            type={locale === 'en-US' ? 'primary' : 'default'}
            loading={loading}
            onClick={() => void setLocale('en-US')}
          >
            English
          </Button>
        </Space>
        <Typography.Title level={3}>{t('保存')}</Typography.Title>
        <Typography.Text>{t('你好，{name}', { name: 'Bubbles' })}</Typography.Text>
        <DatePicker />
      </Space>
    </div>
  )
}

export default Home
