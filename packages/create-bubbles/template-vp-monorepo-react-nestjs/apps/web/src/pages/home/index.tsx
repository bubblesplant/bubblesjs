import { useI18n } from '@/components/I18n/i18n'
import { Button } from 'antd'

const delay = new Promise<void>((resolve) => setTimeout(resolve, 2000))
let resolved = false
void delay.then(() => (resolved = true))

const Home = () => {
  if (!resolved) throw delay

  const { t, loadLocale } = useI18n()

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white p-6">
      {t('保存')}

      <Button onClick={() => void loadLocale('en_US')}>切换语言</Button>
    </div>
  )
}

export default Home
