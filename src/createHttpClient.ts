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

    const { pathname } = new URL(request.url);
    group(`[🟡 REQ] %s %s`, request.method.toUpperCase(), pathname);
    log('Request Body:', options.body || '(No Request Body)');
    groupEnd();
  };

  const logAfterResponse: AfterResponseHook = async (request, _options, response) => {
    const t1 = requestPerformanceMap.get(request);
    const t2 = performance.now();

    const { pathname } = new URL(request.url);
    group(`[🟢 RES] %s %s - %d`, request.method.toUpperCase(), pathname, response.status);

    if (t1 && t2) {
      log(`Time: ${(t2 - t1).toFixed(5)}ms`);
      requestPerformanceMap.delete(request);
    }

    try {
      log('Response Body:', await response.json());
    } catch {
      log('Response Body:', await response.text());
    }

    groupEnd();
  };

  const retryWithRefresh = (getInstance: () => KyInstance): AfterResponseHook => (request, _options, response) => {
    const instance = getInstance();

    if ('__refresh' in request) {
      return;
    }

    Object.assign(request, {
      __refresh: true,
    });

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
