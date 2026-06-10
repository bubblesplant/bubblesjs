import '@nutui/nutui-react-taro/dist/styles/themes/default.css'
import './styles/index.css'
import { useLaunch } from '@tarojs/taro'
import { PropsWithChildren } from 'react'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
  })

  return children
}

export default App
