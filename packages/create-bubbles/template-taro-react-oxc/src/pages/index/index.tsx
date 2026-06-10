import { Cart, Heart, HeartFill, Hi, Home, Top, User } from '@nutui/icons-react-taro'
import { Button, BackTop, Image, Tabbar } from '@nutui/nutui-react-taro'
import { View, Text, ScrollView } from '@tarojs/components'

import './index.scss'
import { useLoad } from '@tarojs/taro'

export default function Index() {
  useLoad(() => {
    console.log('Page loaded.')
  })

  const src =
    'https://storage.360buyimg.com/imgtools/e067cd5b69-07c864c0-dd02-11ed-8b2c-d7f58b17086a.png'

  return (
    <ScrollView className="h-full w-full bg-[green]" scrollY={true}>
      <Text className="bg-[red] text-red-500">Hello world!</Text>
      你好1 你好李焕英 骄傲吧
      <Text className="text-[pink]">你好李焕英</Text>
      <Tabbar>
        <Tabbar.Item title="首页" icon={<Home />} />
        <Tabbar.Item title="逛" icon={<Hi />} />
        <Tabbar.Item
          title="收藏"
          icon={(active: boolean) => (active ? <HeartFill /> : <Heart />)}
        />
        <Tabbar.Item title="购物车" icon={<Cart />} />
        <Tabbar.Item title="我的" icon={<User />} />
      </Tabbar>
      <View className="h-[200rpx] w-[200rpx] bg-[yellow]"></View>
      <View className="h-[200rpx] w-[200rpx] bg-[yellow]"></View>
      <View className="h-[200rpx] w-[200rpx] bg-[gray]">2444</View>
      <Button type="primary">我是一个按钮</Button>
      <BackTop>
        <Top size={12} />
        <View style={{ fontSize: '12px' }}>顶部</View>
      </BackTop>
      <View className="h-[8000rpx] w-[200rpx] bg-[gray]">111</View>
      <Image src={src} height={200} />
      <Button type="primary">我是第二个按钮</Button>
    </ScrollView>
  )
}
