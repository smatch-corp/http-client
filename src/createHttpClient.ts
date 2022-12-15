import ky, { AfterResponseHook, BeforeRequestHook, Options, ResponsePromise } from 'ky';
import { KyInstance } from 'ky/distribution/types/ky';

const noop = () => {};
const group = console.groupCollapsed || console.log;
const groupEnd = console.groupEnd || noop;
const log = console.log;

interface CreateHttpClientOptions extends Options {
  logging?: boolean;
  refresh?: (request: Request, next: (request: Request) => ResponsePromise) => ReturnType<AfterResponseHook>;
}

interface CreateHttpClient {
  (prefixUrl: string, options?: CreateHttpClientOptions): KyInstance;
}

export const createHttpClient: CreateHttpClient = (prefixUrl, options = {}) => {
  const { logging, refresh, ...restOptions } = options;

  const requestPerformanceMap = new Map<Request, DOMHighResTimeStamp>();

  const logBeforeRequest: BeforeRequestHook = (request, options) => {
    requestPerformanceMap.set(request, performance.now());

    group(`[🟡 REQ] %s %s`, request.method.toUpperCase(), request.url);
    log(options.body);
    groupEnd();
  };

  const logAfterResponse: AfterResponseHook = (request, _options, response) => {
    const t1 = requestPerformanceMap.get(request);
    const t2 = performance.now();

    group(`[🟢 RES] %d %s %s %s`, response.status, response.statusText, request.method.toUpperCase(), request.url);
    if (t1 && t2) {
      log(`Time: ${(t2 - t1).toFixed(5)}ms`);
      requestPerformanceMap.delete(request);
    }
    groupEnd();
  };

  const retryWithRefresh = (getInstance: () => KyInstance): AfterResponseHook => (request, _options, response) => {
    const instance = getInstance();

    if (response.status === 401) {
      const next = (request: Request) => {
        return instance(request);
      };

      return refresh!(request, next);
    }
  };

  const instance = ky.create({
    prefixUrl,
    credentials: 'same-origin',
    throwHttpErrors: true,
    hooks: {
      beforeRequest: [
        logging ? logBeforeRequest : noop,
      ],
      afterResponse: [
        logging ? logAfterResponse : noop,
        refresh ? retryWithRefresh(() => instance) : noop,
      ],
    },
  });

  return instance.extend(restOptions);
};
