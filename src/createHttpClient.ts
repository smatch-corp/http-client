import type { AfterResponseHook, BeforeRequestHook, Options, ResponsePromise } from 'ky';
import ky from 'ky';
import { KyInstance } from 'ky/distribution/types/ky';

const noop = () => {};
const group = console.groupCollapsed || console.log;
const groupEnd = console.groupEnd || noop;
const log = console.log;

interface CreateHttpClientOptions extends Options {
  /**
   * Enable logging
   */
  logging?: boolean;

  /**
   * Check response is unauthorized respond.
   * @param response Response
   */
  isUnauthorizedResponse?(response: Response): boolean | Promise<boolean>;

  /**
   * Provide how to refresh your access token by anyway.
   * After refresh token, you should mutate request object, call next with it and return.
   * If you failed return void or do nothing.
   * @param request Request
   * @param next
   * @param instance Ky
   */
  refresh?(
    request: Request,
    next: (request: Request) => ResponsePromise,
    instance: KyInstance,
  ): ReturnType<AfterResponseHook>;
}

interface CreateHttpClient {
  (prefixUrl: string, options?: CreateHttpClientOptions): KyInstance;
}

type RequestPerformanceMap = Map<Request, DOMHighResTimeStamp>;

const createLogBeforeRequest =
  (requestPerformanceMap: RequestPerformanceMap): BeforeRequestHook => (request, options) => {
    requestPerformanceMap.set(request, performance.now());

    const { pathname } = new URL(request.url);
    group(`[🟡 REQ] %s %s`, request.method.toUpperCase(), pathname);
    log('Request Body:', options.body || '(No Request Body)');
    groupEnd();
  };

const createLogAfterResponse =
  (requestPerformanceMap: RequestPerformanceMap): AfterResponseHook => async (request, _options, response) => {
    const t1 = requestPerformanceMap.get(request);
    const t2 = performance.now();

    const { pathname } = new URL(request.url);
    group(`[🟢 RES] %s %s - %d`, request.method.toUpperCase(), pathname, response.status);

    if (t1 && t2) {
      log(`Time: ${(t2 - t1).toFixed(5)}ms`);
      requestPerformanceMap.delete(request);
    }

    try {
      log('Response Body:', await response.clone().json());
    } catch {
      log('Response Body:', await response.clone().text());
    }

    groupEnd();
  };

export const createHttpClient: CreateHttpClient = (prefixUrl, options = {}) => {
  const { logging, isUnauthorizedResponse, refresh, ...restOptions } = options;

  const defaultOptions: Options = {
    prefixUrl,
    credentials: 'same-origin',
  };

  const requestPerformanceMap: RequestPerformanceMap = new Map();

  const retryWithRefresh =
    (getInstance: () => KyInstance): AfterResponseHook => async (request, _options, response) => {
      if (!isUnauthorizedResponse || !refresh) {
        return;
      }

      const instance = getInstance();

      if (await isUnauthorizedResponse(response.clone())) {
        const next = (request: Request) => {
          return instance(request, { retry: 0 });
        };

        return refresh(request, next, ky.create(defaultOptions));
      }
    };

  const instance = ky.create({
    ...defaultOptions,
    hooks: {
      beforeRequest: [
        logging ? createLogBeforeRequest(requestPerformanceMap) : noop,
      ],
      afterResponse: [
        logging ? createLogAfterResponse(requestPerformanceMap) : noop,
        retryWithRefresh(() => instance),
      ],
    },
  });

  return instance.extend(restOptions);
};
