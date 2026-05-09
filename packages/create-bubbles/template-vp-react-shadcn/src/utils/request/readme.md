# request 使用说明

`src/utils/request/index.ts` 导出的是项目统一的 alova 请求实例，业务接口建议统一放在 `src/api` 里封装，页面和组件不要直接散写请求配置。

## 基础用法

请求方法会创建 alova `Method` 实例，不会在创建时立刻发送请求。可以在组件中交给 `useRequest`，也可以在普通函数里直接 `await`。

```ts
import alovaRequest from "@/utils/request";

interface DramaItem {
  id: number;
  title: string;
}

interface DramaListParams {
  page: number;
  pageSize: number;
}

export const getDramaList = (params: DramaListParams) => {
  return alovaRequest.Get<DramaItem[]>("/drama/list", { params });
};
```

组件中使用：

```tsx
import { useRequest } from "alova/client";

import { getDramaList } from "@/api";

export function DramaList() {
  const { data, loading, error } = useRequest(getDramaList({ page: 1, pageSize: 20 }), {
    initialData: [],
  });

  // ...
}
```

普通异步函数中使用：

```ts
const list = await getDramaList({ page: 1, pageSize: 20 });
```

## 请求参数

GET 查询参数放在第二个参数的 `params` 里：

```ts
alovaRequest.Get<UserInfo>("/user/detail", {
  params: {
    id: 1,
  },
});
```

POST、PUT、PATCH、DELETE 的 body 放在第二个参数，配置放在第三个参数：

```ts
alovaRequest.Post<CreateUserResult>("/user/create", {
  name: "Tom",
});

alovaRequest.Post<CreateUserResult>(
  "/user/create",
  { name: "Tom" },
  {
    meta: {
      isShowSuccessMessage: true,
    },
  },
);
```

## 返回结构

默认按下面这种后端格式处理：

```ts
interface ApiResponse<T> {
  code: number;
  data: T;
  msg: string;
}
```

默认规则：

- HTTP 状态码 `200`、`201`、`204` 视为成功。
- 业务 `code` 在 `codeMap.success` 中视为成功，当前默认是 `[200]`。
- 成功后返回 `data` 字段，所以 `alovaRequest.Get<User[]>` 的最终数据类型就是 `User[]`。
- 如果响应不是普通对象，会直接返回解析后的原始数据，比如字符串。

## 提示开关

单次请求可以通过 `meta` 控制是否转换响应、是否显示成功提示、是否显示错误提示。

```ts
alovaRequest.Post(
  "/user/update",
  { id: 1, name: "Tom" },
  {
    meta: {
      isShowSuccessMessage: true,
      isShowErrorMessage: false,
    },
  },
);
```

也可以创建一个带临时配置的请求实例：

```ts
const silentRequest = alovaRequest({
  isShowErrorMessage: false,
});

silentRequest.Get<UserInfo>("/user/detail", {
  params: { id: 1 },
});
```

## 原始响应

下载文件、读取响应头、或不想走业务 `code/data/msg` 转换时，关闭 `isTransformResponse`。

```ts
const downloadFile = () => {
  return alovaRequest.Get<Response>("/file/download", {
    meta: {
      isTransformResponse: false,
    },
  });
};

const response = await downloadFile();
const blob = await response.blob();
```

## 错误处理

HTTP 状态码错误、业务 `code` 错误都会抛出 `RequestError`，alova hook 会进入 `error` 分支。

```ts
import { RequestError } from "@/utils/request/alova-core";

try {
  await getDramaList({ page: 1, pageSize: 20 });
} catch (error) {
  if (error instanceof RequestError) {
    console.log(error.status, error.code, error.message);
  }
}
```

`401` 会自动执行 `unAuthorizedResponseFunc`，当前行为是跳转到 `/login` 并提示登录过期。

## 环境变量

请求基础路径来自 `VITE_API_AFFIX`：

```env
VITE_API_AFFIX=/api
```

没有配置时会使用 `/`，避免出现 `/undefined`。

## 注意事项

- 业务接口优先写成函数并标注返回泛型，例如 `alovaRequest.Get<UserInfo>()`，组件里的 `useRequest` 会自动推断数据类型。
- 不要把 GET 查询参数直接作为第二个裸对象传入，第二个参数是配置对象，查询参数必须放到 `{ params }`。
- 需要局部关闭错误提示时优先用 `meta.isShowErrorMessage`，不要在组件里重复 toast。
