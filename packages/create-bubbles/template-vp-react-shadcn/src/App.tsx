import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { Suspense } from "react";
import { RouterProvider } from "react-router";

import PageLoading from "@/components/Loading/PageLoading";
import { Toaster } from "@/components/ui/sonner";

import { router } from "./router";

dayjs.locale("zh-cn");

function App() {
  return (
    <>
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </>
  );
}

export default App;
