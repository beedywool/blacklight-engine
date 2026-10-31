import {
  DropItem,
  defineModule,
  isNetworkError,
  t,
  type ModuleContext,
  type OfflineQueue,
  type QueueEvents,
  type Schema,
  type Unsubscribe,
} from '@blacklight/core';

/** Options of the `http` module in `game.config.ts`, with their defaults applied. */
export interface HttpConfig {
  /** Prefix of relative paths: `get('/scores')` → `<baseUrl>/scores`. Unset: relative to the page. */
  baseUrl: string | undefined;
  /** Request timeout in ms. @defaultValue `10000` */
  timeout: number;
  /** Headers added to every request. @defaultValue `{}` */
  headers: Record<string, string>;
  /** First retry delay of queued requests in ms (doubles after each failure). @defaultValue `1000` */
  retryDelay: number;
  /** Longest delay between retries of queued requests in ms. @defaultValue `300000` */
  maxDelay: number;
  /** Attempts before a queued request is dropped; `0` retries forever. @defaultValue `0` */
  maxAttempts: number;
}

/** What `game.config.ts` may write under `modules.http`: every option is optional. */
export type HttpConfigInput = Partial<HttpConfig>;

const config: Schema<HttpConfig, HttpConfigInput> = t.object({
  baseUrl: t.string({ url: true }).optional(),
  timeout: t.number({ min: 1 }).default(10_000),
  headers: t.record(t.string()).default({}),
  retryDelay: t.number({ min: 1 }).default(1000),
  maxDelay: t.number({ min: 1 }).default(300_000),
  maxAttempts: t.number({ integer: true, min: 0 }).default(0),
});

/** Options of one request. */
export interface RequestOptions {
  /** @defaultValue `'GET'` */
  method?: string;
  /** Sent as JSON with `content-type: application/json`. */
  json?: unknown;
  /** Raw body (ignored when `json` is set). */
  body?: string | Uint8Array;
  /** Headers of this request, added to (and overriding) the module's `headers`. */
  headers?: Record<string, string>;
  /** Added to the URL as a query string. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Overrides the module's timeout (ms). */
  timeout?: number;
  /** Adds the `Authorization` header registered with `authorize` for this URL. @defaultValue `true` */
  auth?: boolean;
}

/** A response with its parsed body (JSON when the server says so, text otherwise). */
export interface HttpResponse<T> {
  /** HTTP status code, between 200 and 299 (other statuses throw {@link HttpError}). */
  status: number;
  /** Response headers. */
  headers: Headers;
  /** Parsed JSON when the `content-type` says JSON, the body text otherwise. */
  data: T;
}

/**
 * Thrown by `request`, `get`, `post` and the other direct calls when the server answers with an
 * error status (not 2xx). Its message names the URL, the status and the server's `message` field.
 *
 * @example
 * ```ts
 * import { HttpError } from '@blacklight/module-http';
 *
 * try {
 *   await this.game.modules.http.post('/scores', { points: 1200 });
 * } catch (error) {
 *   if (error instanceof HttpError && error.status === 401) this.goto('login');
 *   else throw error;
 * }
 * ```
 */
export class HttpError extends Error {
  constructor(
    /** HTTP status code of the answer, e.g. `404`. */
    readonly status: number,
    /** Parsed body of the answer (JSON or text), often the server's error details. */
    readonly data: unknown,
    url: string,
  ) {
    const detail =
      typeof data === 'object' && data !== null && 'message' in data
        ? `: ${String((data as { message: unknown }).message)}`
        : '';
    super(`${url} answered HTTP ${status}${detail}`);
    this.name = 'HttpError';
  }
}

/**
 * Thrown by the direct calls when a request cannot reach its server (offline, DNS failure,
 * connection refused, timeout). Requests that must arrive anyway go through `send`, which queues
 * them instead.
 *
 * @example
 * ```ts
 * import { OfflineError } from '@blacklight/module-http';
 *
 * let news: News[] = [];
 * try {
 *   news = await this.game.modules.http.get<News[]>('/news');
 * } catch (error) {
 *   if (!(error instanceof OfflineError)) throw error; // offline: show the menu without news
 * }
 * ```
 */
export class OfflineError extends Error {
  constructor(url: string, cause: unknown) {
    super(
      `${url} could not be reached (${cause instanceof Error ? cause.message : String(cause)}). The device may be offline; use http.send() to queue requests that must arrive later.`,
    );
    this.name = 'OfflineError';
  }
}

/** A request stored by `send` until it is delivered. */
export interface QueuedRequest {
  /** Absolute URL, query string included. */
  url: string;
  /** HTTP method in capitals, e.g. `'POST'`. */
  method: string;
  /** Headers of the request (the module's `headers` are added when it is sent). */
  headers: Record<string, string>;
  /** Body as text (a JSON body is already serialized). */
  body?: string;
  /** Whether the `Authorization` header registered with `authorize` is added when it is sent. */
  auth: boolean;
}

/** Gives the `Authorization` header value for a request, or `undefined` for none. */
export type AuthProvider = (url: string) => string | undefined | Promise<string | undefined>;

function statusRetries(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * API of the `http` module: `game.modules.http`. Direct calls (`request`, `get`, `post`…) answer
 * now or throw; `send` queues requests that must arrive even offline.
 */
export interface Http {
  /** `true` while requests are expected to reach the network. */
  readonly online: boolean;
  /** Requests stored by {@link Http.send} and not delivered yet. */
  readonly pending: number;
  /**
   * Sends a request now and resolves with the response.
   *
   * @throws {@link HttpError} for an error status, {@link OfflineError} when the server cannot be reached.
   */
  request: <T = unknown>(path: string, options?: RequestOptions) => Promise<HttpResponse<T>>;
  /** `GET` and returns the parsed body. */
  get: <T = unknown>(path: string, options?: RequestOptions) => Promise<T>;
  /** `POST` with a JSON body and returns the parsed response body. */
  post: <T = unknown>(path: string, json?: unknown, options?: RequestOptions) => Promise<T>;
  /** `PUT` with a JSON body. */
  put: <T = unknown>(path: string, json?: unknown, options?: RequestOptions) => Promise<T>;
  /** `PATCH` with a JSON body. */
  patch: <T = unknown>(path: string, json?: unknown, options?: RequestOptions) => Promise<T>;
  /** `DELETE` and returns the parsed body. */
  delete: <T = unknown>(path: string, options?: RequestOptions) => Promise<T>;
  /**
   * Queues a request that must arrive even if the game is offline or closes: it is stored on the
   * device, sent in order, and retried with backoff until the server accepts it. A 4xx answer
   * (except 408, 425, 429) drops it. Resolves once stored.
   */
  send(path: string, options?: RequestOptions): Promise<void>;
  /** Retries the queued requests now. */
  flush: () => Promise<void>;
  /** Listens to delivered (`sent`) or failed (`failed`) queued requests. */
  on<E extends keyof QueueEvents<QueuedRequest>>(
    event: E,
    listener: (payload: QueueEvents<QueuedRequest>[E]) => void,
  ): Unsubscribe;
  /**
   * Adds an `Authorization` header to requests whose URL starts with `prefix` (the accounts module
   * registers its server this way). The provider runs for each request, so tokens can refresh.
   */
  authorize(prefix: string, provider: AuthProvider): Unsubscribe;
}

function createHttp(context: ModuleContext<HttpConfig>): Http {
  const { config, network } = context;
  const auth = new Map<string, AuthProvider>();

  const toUrl = (path: string, query?: RequestOptions['query']): string => {
    let url: URL;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) url = new URL(path);
    else if (config.baseUrl)
      url = new URL(path.replace(/^\//, ''), config.baseUrl.replace(/\/?$/, '/'));
    else if (typeof location !== 'undefined') url = new URL(path, location.href);
    else {
      throw new Error(
        `http: "${path}" is a relative URL and no baseUrl is set. Set \`modules.http.baseUrl\` in game.config.ts or pass an absolute URL.`,
      );
    }
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  };

  const authorization = async (url: string): Promise<string | undefined> => {
    for (const [prefix, provider] of auth) {
      if (url.startsWith(prefix)) return provider(url);
    }
    return undefined;
  };

  const perform = async <T>(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string | Uint8Array;
      timeout: number;
      auth: boolean;
    },
  ): Promise<HttpResponse<T>> => {
    const headers = { ...config.headers, ...init.headers };
    if (init.auth && !Object.keys(headers).some((h) => h.toLowerCase() === 'authorization')) {
      const value = await authorization(url);
      if (value) headers.authorization = value;
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        headers,
        body: init.body as BodyInit | undefined,
        signal: AbortSignal.timeout(init.timeout),
      });
    } catch (error) {
      if (isNetworkError(error) || (error as Error).name === 'TimeoutError') {
        network.reportFailure();
        throw new OfflineError(url, error);
      }
      throw error;
    }
    network.reportSuccess();
    const type = response.headers.get('content-type') ?? '';
    const text = await response.text();
    let data: unknown = text;
    if (type.includes('json') && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) throw new HttpError(response.status, data, url);
    return { status: response.status, headers: response.headers, data: data as T };
  };

  const prepare = (path: string, options: RequestOptions) => {
    const headers = { ...options.headers };
    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['content-type'] = 'application/json';
    }
    return {
      url: toUrl(path, options.query),
      method: (options.method ?? 'GET').toUpperCase(),
      headers,
      body,
      timeout: options.timeout ?? config.timeout,
      auth: options.auth ?? true,
    };
  };

  const queue: OfflineQueue<QueuedRequest> = network.queue<QueuedRequest>(
    'requests',
    async (item) => {
      try {
        await perform(item.url, { ...item, timeout: config.timeout });
      } catch (error) {
        // A client error will fail again: drop it instead of blocking the queue forever.
        if (error instanceof HttpError && !statusRetries(error.status)) {
          throw new DropItem(error.message);
        }
        throw error;
      }
    },
    { retryDelay: config.retryDelay, maxDelay: config.maxDelay, maxAttempts: config.maxAttempts },
  );
  queue.events.on('failed', ({ item, error, willRetry }) => {
    if (!willRetry) context.log.warn(`dropped ${item.method} ${item.url}:`, error);
  });

  const request = async <T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResponse<T>> => {
    const prepared = prepare(path, options);
    return perform<T>(prepared.url, prepared);
  };

  const data =
    (method: string) =>
    async <T = unknown>(path: string, json?: unknown, options: RequestOptions = {}): Promise<T> =>
      (await request<T>(path, { ...options, method, json })).data;

  return {
    /** `true` while requests are expected to reach the network. */
    get online(): boolean {
      return network.online;
    },
    /** Requests stored by {@link send} and not delivered yet. */
    get pending(): number {
      return queue.size;
    },
    /**
     * Sends a request now and resolves with the response.
     *
     * @throws {@link HttpError} for an error status, {@link OfflineError} when the server cannot be reached.
     */
    request,
    /** `GET` and returns the parsed body. */
    get: async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> =>
      (await request<T>(path, { ...options, method: 'GET' })).data,
    /** `POST` with a JSON body and returns the parsed response body. */
    post: data('POST'),
    /** `PUT` with a JSON body. */
    put: data('PUT'),
    /** `PATCH` with a JSON body. */
    patch: data('PATCH'),
    /** `DELETE` and returns the parsed body. */
    delete: async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> =>
      (await request<T>(path, { ...options, method: 'DELETE' })).data,
    /**
     * Queues a request that must arrive even if the game is offline or closes: it is stored on the
     * device, sent in order, and retried with backoff until the server accepts it. A 4xx answer
     * (except 408, 425, 429) drops it. Resolves once stored.
     */
    async send(path: string, options: RequestOptions = {}): Promise<void> {
      const prepared = prepare(path, { method: 'POST', ...options });
      if (prepared.body instanceof Uint8Array) {
        throw new Error('http.send() stores requests as text: send JSON or a string body.');
      }
      await queue.push({
        url: prepared.url,
        method: prepared.method,
        headers: prepared.headers,
        body: prepared.body,
        auth: prepared.auth,
      });
    },
    /** Retries the queued requests now. */
    flush: (): Promise<void> => queue.flush(),
    /** Listens to delivered (`sent`) or failed (`failed`) queued requests. */
    on<E extends keyof QueueEvents<QueuedRequest>>(
      event: E,
      listener: (payload: QueueEvents<QueuedRequest>[E]) => void,
    ): Unsubscribe {
      return queue.events.on(event, listener);
    },
    /**
     * Adds an `Authorization` header to requests whose URL starts with `prefix` (the accounts module
     * registers its server this way). The provider runs for each request, so tokens can refresh.
     */
    authorize(prefix: string, provider: AuthProvider): Unsubscribe {
      auth.set(prefix, provider);
      return () => auth.delete(prefix);
    },
  };
}

/**
 * HTTP requests for games (MOD-06): JSON helpers, timeouts, authorization per server and an
 * offline queue that stores requests on the device and replays them when the network returns.
 *
 * @example
 * ```ts
 * // game.config.ts
 * modules: { http: { baseUrl: 'https://api.example.com' } }
 *
 * // in a scene
 * const top = await this.game.modules.http.get<Score[]>('/scores');
 * await this.game.modules.http.send('/scores', { json: { points: 1200 } }); // queued offline
 * ```
 */
export const http = defineModule({
  name: 'http',
  version: '0.0.0',
  config,
  setup: (context) => createHttp(context),
});
