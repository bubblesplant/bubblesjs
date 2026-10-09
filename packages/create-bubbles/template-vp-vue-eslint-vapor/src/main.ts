import { vaporInteropPlugin } from 'vue'

import App from './App.vue'
import { setupRouter } from './router'
import { setupStore } from './store'

import 'virtual:svg-icons-register'

import '@/styles/index.scss'
import 'virtual:uno.css'

// vue-tsc 3.3.8 still types SFC imports as VDOM components in global Vapor mode.
const app = createApp(App)
app.use(vaporInteropPlugin)
setupRouter(app)
setupStore(app)

app.mount('#app')
