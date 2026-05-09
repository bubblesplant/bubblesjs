import reactHook from "alova/react";
import { toast } from "sonner";

import { navigator } from "@/router";
import { envVariables } from "@/utils/env";

import { createDualCallInstance } from "./alova-core";

function normalizeBaseUrl(apiAffix?: string) {
  if (!apiAffix) return "/";
  if (/^https?:\/\//.test(apiAffix) || apiAffix.startsWith("/")) {
    return apiAffix;
  }

  return `/${apiAffix}`;
}

function getBaseConfig(): Parameters<typeof createDualCallInstance>[0] {
  return {
    baseUrl: normalizeBaseUrl(envVariables.API_AFFIX),
    statusMap: {
      success: [200, 201, 204],
      unAuthorized: 401,
    },
    codeMap: {
      success: [200],
      unAuthorized: [401],
    },
    responseDataKey: "data",
    responseMessageKey: "msg",
    commonHeaders: {},
    successMessageFunc: (msg) => {
      toast.success(msg);
    },
    errorMessageFunc: (msg) => {
      toast.error(msg);
    },
    unAuthorizedResponseFunc: () => {
      navigator("/login");
      toast.error("登录过期或未登录");
    },
    statesHook: reactHook,
  };
}

const alovaRequest = createDualCallInstance(getBaseConfig());

export default alovaRequest;
