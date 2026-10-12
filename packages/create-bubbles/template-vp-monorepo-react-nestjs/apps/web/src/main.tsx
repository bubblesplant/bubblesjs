import './styles/index.css'
import './styles/dream.css'

import I18nProvider from '@bubblesjs/i18n-react'
import App from './App.tsx'
import { appI18nStore } from './i18n'

createRoot(document.getElementById('root')!).render(
  <I18nProvider store={appI18nStore}>
    <App />
  </I18nProvider>,
)
