import { defineStore } from "pinia";

import { store } from "..";

export const useUserStore = defineStore("user", {
  state: () => {
    return {
      name: "admin",
      token: "admin",
      avatar: "https://wpimg.wallstcn.com/f778738c-e4f8-4870-b634-56703b4acafe.gif",
    };
  },
});

export function useUserStoreWithOut() {
  return useUserStore(store);
}
