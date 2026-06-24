import { DatePicker } from 'antd'

const delay = new Promise<void>((resolve) => setTimeout(resolve, 2000))
let resolved = false
delay.then(() => (resolved = true))

const Home = () => {
  if (!resolved) throw delay

  return (
    <div className="w-full bg-red-900">
      <DatePicker />
    </div>
  )
}

export default Home
