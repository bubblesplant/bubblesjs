import Taro from '@tarojs/taro'

export const TaroStorage = {
  getItem: (name: string) => Taro.getStorageSync(name),
  setItem: (name: string, value: string) => Taro.setStorageSync(name, value),
  removeItem: (name: string) => Taro.removeStorageSync(name),
}
