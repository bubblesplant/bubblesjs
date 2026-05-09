import type { Alova, AlovaDefaultCacheAdapter, AlovaOptions } from "alova";
import { createAlova } from "alova";
import adapterFetch, { type FetchRequestAdapter, type FetchRequestInit } from "alova/fetch";
import type { ReactHookExportType } from "alova/react";

import { deepMergeObject, isPlainObject } from "./utils";

type StatusMatcher = number | number[];
type HeaderValue = string | (() => string);
type RequestAlovaGenerics = {
  Responded: unknown;
  Transformed: unknown;
  RequestConfig: FetchRequestInit;
  Response: Response;
  ResponseHeader: Headers;
  L1Cache: AlovaDefaultCacheAdapter;
  L2Cache: AlovaDefaultCacheAdapter;
  StatesExport: ReactHookExportType<unknown>;
};

interface StatusMap {
  success?: StatusMatcher;
  unAuthorized?: StatusMatcher;
}

interface CodeMap {
  success?: number[];
  unAuthorized?: number[];
}

export interface BaseRequestOption {
  baseUrl?: string;
  timeout?: number;
  commonHeaders?: Record<string, HeaderValue>;
  statusMap?: StatusMap;
  codeMap?: CodeMap;
  responseDataKey?: string;
  responseMessageKey?: string;
  isTransformResponse?: boolean;
  isShowSuccessMessage?: boolean;
  successDefaultMessage?: string;
  isShowErrorMessage?: boolean;
  errorDefaultMessage?: string;
  statesHook?: AlovaOptions<RequestAlovaGenerics>["statesHook"];
  successMessageFunc?: (message: string) => void;
  errorMessageFunc?: (message: string) => void;
  unAuthorizedResponseFunc?: () => void;
  requestAdapter?: FetchRequestAdapter;
}

export interface CustomConfig {
  isTransformResponse?: boolean;
  isShowSuccessMessage?: boolean;
  isShowErrorMessage?: boolean;
}

declare module "alova" {
  interface AlovaCustomTypes {
    meta: CustomConfig;
  }
}

interface RequestErrorOptions {
  status?: number;
  code?: unknown;
  data?: unknown;
  response?: Response;
}

export class RequestError extends Error {
  status?: number;
  code?: unknown;
  data?: unknown;
  response?: Response;

  constructor(message: string, options: RequestErrorOptions = {}) {
    super(message);
    this.name = "RequestError";
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
    this.response = options.response;
  }
}

export type RequestInstance = Alova<RequestAlovaGenerics>;
export type DualCallInstance = RequestInstance & ((option?: CustomConfig) => RequestInstance);

type RequestOption = BaseRequestOption & CustomConfig;

const DEFAULT_REQUEST_ADAPTER = adapterFetch();
const DEFAULT_RESPONSE_DATA_KEY = "data";
const DEFAULT_RESPONSE_MESSAGE_KEY = "message";
const DEFAULT_SUCCESS_MESSAGE = "操作成功";
const DEFAULT_ERROR_MESSAGE = "服务异常";
const DEFAULT_REQUEST_OPTION: RequestOption = {
  baseUrl: "/",
  timeout: 0,
  statusMap: {
    success: [200, 201, 204],
    unAuthorized: 401,
  },
  codeMap: {
    success: [200],
    unAuthorized: [401],
  },
  responseDataKey: DEFAULT_RESPONSE_DATA_KEY,
  responseMessageKey: DEFAULT_RESPONSE_MESSAGE_KEY,
  isTransformResponse: true,
  isShowSuccessMessage: false,
  successDefaultMessage: DEFAULT_SUCCESS_MESSAGE,
  isShowErrorMessage: true,
  errorDefaultMessage: DEFAULT_ERROR_MESSAGE,
  requestAdapter: DEFAULT_REQUEST_ADAPTER,
};

function isMatchedStatus(status: number, matcher?: StatusMatcher) {
  if (matcher === undefined) return status >= 200 && status < 300;
  return Array.isArray(matcher) ? matcher.includes(status) : matcher === status;
}

function isMatchedCode(code: unknown, codes?: number[]) {
  if (!codes?.length) return true;

  const normalizedCode = Number(code);
  return Number.isFinite(normalizedCode) && codes.includes(normalizedCode);
}

function getResponseMessage(data: unknown, messageKey: string, defaultMessage: string) {
  if (!isPlainObject(data)) return defaultMessage;

  const message = data[messageKey] ?? data.message ?? data.msg;
  if (typeof message === "string") return message || defaultMessage;
  if (typeof message === "number") return String(message);

  return defaultMessage;
}

function getRuntimeConfig(option: RequestOption, customConfig?: CustomConfig) {
  return {
    isTransformResponse: customConfig?.isTransformResponse ?? option.isTransformResponse ?? true,
    isShowSuccessMessage:
      customConfig?.isShowSuccessMessage ?? option.isShowSuccessMessage ?? false,
    isShowErrorMessage: customConfig?.isShowErrorMessage ?? option.isShowErrorMessage ?? true,
  };
}

async function parseResponse(response: Response) {
  if (!response.body || response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  if (contentType.startsWith("text/")) return response.text();

  const clonedResponse = response.clone();
  try {
    return await response.json();
  } catch {
    try {
      return await clonedResponse.text();
    } catch {
      return undefined;
    }
  }
}

export function createInstance(option: RequestOption): RequestInstance {
  const mergeOption = deepMergeObject(DEFAULT_REQUEST_OPTION, option);

  return createAlova({
    baseURL: mergeOption.baseUrl,
    timeout: mergeOption.timeout,
    statesHook: mergeOption.statesHook,
    requestAdapter: mergeOption.requestAdapter ?? DEFAULT_REQUEST_ADAPTER,
    beforeRequest: (method) => {
      for (const [key, value] of Object.entries(mergeOption.commonHeaders ?? {})) {
        method.config.headers[key] = typeof value === "function" ? value() : value;
      }
    },
    cacheFor: null,
    responded: {
      onSuccess: async (response, method) => {
        const runtimeConfig = getRuntimeConfig(mergeOption, method.config.meta);
        if (!runtimeConfig.isTransformResponse) return response;

        const data = await parseResponse(response);
        const responseMessageKey = mergeOption.responseMessageKey ?? DEFAULT_RESPONSE_MESSAGE_KEY;
        const errorDefaultMessage = mergeOption.errorDefaultMessage ?? DEFAULT_ERROR_MESSAGE;

        if (!isMatchedStatus(response.status, mergeOption.statusMap?.success)) {
          if (isMatchedStatus(response.status, mergeOption.statusMap?.unAuthorized)) {
            mergeOption.unAuthorizedResponseFunc?.();
          }

          const errorMessage = getResponseMessage(data, responseMessageKey, errorDefaultMessage);
          if (runtimeConfig.isShowErrorMessage) {
            mergeOption.errorMessageFunc?.(errorMessage);
          }
          throw new RequestError(errorMessage, {
            status: response.status,
            data,
            response,
          });
        }

        if (!isPlainObject(data)) return data;

        const responseCode = data.code;
        const responseMessage = getResponseMessage(
          data,
          responseMessageKey,
          mergeOption.successDefaultMessage ?? DEFAULT_SUCCESS_MESSAGE,
        );

        if (
          responseCode !== undefined &&
          !isMatchedCode(responseCode, mergeOption.codeMap?.success)
        ) {
          if (isMatchedCode(responseCode, mergeOption.codeMap?.unAuthorized)) {
            mergeOption.unAuthorizedResponseFunc?.();
          }

          const errorMessage = getResponseMessage(data, responseMessageKey, errorDefaultMessage);
          if (runtimeConfig.isShowErrorMessage) {
            mergeOption.errorMessageFunc?.(errorMessage);
          }
          throw new RequestError(errorMessage, {
            status: response.status,
            code: responseCode,
            data,
            response,
          });
        }

        if (runtimeConfig.isShowSuccessMessage) {
          mergeOption.successMessageFunc?.(responseMessage);
        }

        const responseDataKey = mergeOption.responseDataKey ?? DEFAULT_RESPONSE_DATA_KEY;
        return responseDataKey in data ? data[responseDataKey] : data;
      },
      onError: (error) => {
        const errorMessage =
          error instanceof Error
            ? error.message
            : (mergeOption.errorDefaultMessage ?? DEFAULT_ERROR_MESSAGE);

        if (mergeOption.isShowErrorMessage) {
          mergeOption.errorMessageFunc?.(errorMessage);
        }

        throw error;
      },
    },
  });
}

export function createDualCallInstance(baseConfig: BaseRequestOption): DualCallInstance {
  const defaultInstance = createInstance(baseConfig);
  const dualInstance = ((option?: CustomConfig) => {
    if (!option) return defaultInstance;
    return createInstance(deepMergeObject(baseConfig, option));
  }) as DualCallInstance;

  Object.assign(dualInstance, defaultInstance);
  dualInstance.Get = defaultInstance.Get.bind(defaultInstance);
  dualInstance.Post = defaultInstance.Post.bind(defaultInstance);
  dualInstance.Put = defaultInstance.Put.bind(defaultInstance);
  dualInstance.Delete = defaultInstance.Delete.bind(defaultInstance);
  dualInstance.Patch = defaultInstance.Patch.bind(defaultInstance);
  dualInstance.Head = defaultInstance.Head.bind(defaultInstance);
  dualInstance.Options = defaultInstance.Options.bind(defaultInstance);
  dualInstance.Request = defaultInstance.Request.bind(defaultInstance);

  return dualInstance;
}
