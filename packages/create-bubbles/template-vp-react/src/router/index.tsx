import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

export const lazyLoad = (path: string, fileName = "index") => {
  const Module = lazy(() => import(`@/pages/${path}/${fileName}.tsx`));
  return <Module />;
};

const routes: RouteObject[] = [
  {
    path: "/",
    id: "index",
    element: <Navigate to={"/home"} />,
  },
  {
    path: "/home",
    id: "home",
    element: lazyLoad("home"),
  },
];

export const router = createBrowserRouter(routes, {
  basename: "/",
});

export const navigator = router.navigate;
