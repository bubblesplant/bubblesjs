import { createApp } from 'vue'
import { setupStore } from './store'
import '@nutui/touch-emulator'
import 'uno.css'
import './app.css'

const App = createApp({
  onShow(_options) {
  },
})

setupStore(App)

export default App
