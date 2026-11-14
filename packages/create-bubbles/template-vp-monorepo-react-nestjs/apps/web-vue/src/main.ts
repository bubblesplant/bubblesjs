import { createApp } from 'vue'
import App from './App.vue'
import { setupRouter } from './router'
import { setupStore } from './store'
import 'antdv-next/dist/reset.css'
import '@bubblesjs/antdv-next-pro/style.css'
import 'nprogress/nprogress.css'
import 'virtual:svg-icons-register'
import 'virtual:uno.css'
import '@/styles/index.scss'

const app = createApp(App)
setupStore(app)
setupRouter(app)
app.mount('#app')
