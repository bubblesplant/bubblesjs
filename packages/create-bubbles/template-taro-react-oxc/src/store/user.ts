import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { TaroStorage } from "./taroStorage";

const useUserStore = create(persist((set, get) => ({
  userInfo: undefined
}),{
  name: 'userStore',
  storage: createJSONStorage(() => TaroStorage)
}))


export default useUserStore
