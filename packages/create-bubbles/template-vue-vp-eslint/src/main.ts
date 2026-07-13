import { createApp } from "vue";

import App from "./App.vue";
import { setupRouter } from "./router";
import { setupStore } from "./store";

import "virtual:svg-icons-register";

import "@/styles/index.scss";
import "virtual:uno.css";

const app = createApp(App);
setupRouter(app);
setupStore(app);

app.mount("#app");
