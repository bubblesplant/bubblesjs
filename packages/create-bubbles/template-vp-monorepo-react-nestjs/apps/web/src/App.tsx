import { StyleProvider } from '@ant-design/cssinjs'
import { ProConfigProvider } from '@ant-design/pro-components'
import { useI18n } from '@bubblesjs/i18n-react'
import { App as AntdApp, ConfigProvider } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/en'
import 'dayjs/locale/zh-cn'
import PageLoading from '@/components/Loading/PageLoading'
import { appTheme } from '@/config/theme'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/config'
import { getUiLocale } from '@/i18n/ui-locale'
import styles from './App.module.css'
import { router } from './router'

/** 配置全局主题、组件上下文与统一懒加载边界，让路由完成加载后执行一次页面过渡。 */
function App() {
  const { locale } = useI18n()
  const activeLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE
  const uiLocale = getUiLocale(activeLocale)

  useEffect(() => {
    dayjs.locale(uiLocale.dayjs)
    document.documentElement.lang = uiLocale.document
  }, [uiLocale.dayjs, uiLocale.document])

  return (
    <StyleProvider layer>
      <ConfigProvider locale={uiLocale.antd} theme={appTheme}>
        <ProConfigProvider intl={uiLocale.pro}>
          <AntdApp className={styles.app}>
            {/* 懒加载统一等待，保留旧页面直到目标页面可以提交。 */}
            <Suspense fallback={<PageLoading />}>
              {/* 加载态立即更新，最终路由通过 transition 提交。 */}
              <RouterProvider router={router} useTransitions />
            </Suspense>
          </AntdApp>
        </ProConfigProvider>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
