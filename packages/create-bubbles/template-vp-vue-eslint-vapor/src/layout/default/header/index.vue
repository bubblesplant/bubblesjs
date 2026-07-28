<script setup lang="ts">
import { Avatar, Dropdown } from "antdv-next";
import { defineComponent, h } from "vue";

import { useUserStoreWithOut } from "@/store/modules/user";

const userStore = useUserStoreWithOut();
const router = useRouter();

function handleMenuClick({ key }: { key: string }) {
  if (key === "logout") {
    userStore.$reset();
    router.push("/login");
  }
}

const dropdownItems = [{ key: "logout", label: "退出登录" }];

const VdomUserDropdown = defineComponent({
  name: "VdomUserDropdown",
  setup() {
    return () =>
      h(
        Dropdown,
        {
          trigger: ["click"],
          menu: {
            items: dropdownItems,
          },
          onMenuClick: handleMenuClick,
        },
        {
          default: () =>
            h("div", { class: "flex-center gap-2 cursor-pointer" }, [
              h(
                Avatar,
                {
                  size: 32,
                  src: userStore.avatar,
                },
                {
                  default: () => userStore.name?.charAt(0).toUpperCase(),
                },
              ),
              h("span", { class: "text-sm" }, userStore.name),
            ]),
        },
      );
  },
});
</script>

<template>
  <div class="flex gap-3 items-center">
    <VdomUserDropdown />
  </div>
</template>
