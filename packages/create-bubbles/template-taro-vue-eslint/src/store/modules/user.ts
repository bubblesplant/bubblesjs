import { defineStore } from 'pinia'
import { ref } from 'vue'
import { TaroStorage } from '../taroStorage'

export const useUserStore = defineStore('user', () => {
  const user = ref('1')

  return {
    user,
  }
}, {
  persist: {
    storage: TaroStorage,
  },
})
