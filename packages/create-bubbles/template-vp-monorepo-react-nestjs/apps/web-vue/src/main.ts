import { createApp, defineComponent, h, Suspense } from "vue";

import App from "./App.vue";
import { setupRouter } from "./router";
import { setupStore } from "./store";

import "virtual:svg-icons-register";

import "@/styles/index.scss";
import "virtual:uno.css";

const AppRoot = defineComponent({
  name: "AppRoot",
  setup() {
    return () =>
      h(Suspense, null, {
        default: () => h(App),
        fallback: () => h("div", "Loading..."),
      });
  },
});

const app = createApp(AppRoot);
setupRouter(app);
setupStore(app);

app.mount("#app");
