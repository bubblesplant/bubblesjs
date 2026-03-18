import Image from 'next/image'
import Banner from '@/assets/image/banner_1.png'

function Main() {
  return (
    <main>
      <Image src={Banner} alt="banner" />
      <img src="/logo.svg" alt="logo" />
    </main>
  )
}

export default Main
