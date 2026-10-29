import {
  DropItem,
  defineModule,
  isNetworkError,
  t,
  type Infer,
  type ModuleContext,
  type OfflineQueue,
  type QueueEvents,
  type Unsubscribe,
} from '@blacklight/core';

const config = t.object({
  /** Prefix of relative paths: `get('/scores')` → `<baseUrl>/scores`. */
  baseUrl: t.string({ url: true }).optional(),
  /** Request timeout in ms. */
  timeout: t.number({ min: 1 }).default(10_000),
  /** Headers added to every request. */
  headers: t.record(t.string()).default({}),
  /** First retry delay of queued requests in ms (doubles after each failure). */
  retryDelay: t.number({ min: 1 }).default(1000),
  /** Longest delay between retries in ms. */
  maxDelay: t.number({ min: 1 }).default(300_000),
  /** Attempts before a queued request is dropped; `0` retries forever. */
  maxAttempts: t.number({ integer: true, min: 0 }).default(0),
});

/** Options of the `http` module in `game.config.ts`. */
export type HttpConfig = Infer<typeof config>;

/** Options of one request. */
export interface RequestOptions {
  /** @defaultValue `'GET'` */
  method?: string;
  /** Sent as JSON with `content-type: application/json`. */
  json?: unknown;
  /** Raw body (ignored when `json` is set). */
  body?: string | Uint8Array;
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
  status: number;
  headers: Headers;
  data: T;
}

/** The server answered with an error status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
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

/** A request that could not reach its server (offline, DNS, refused, timeout). */
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
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  auth: boolean;
}

/** Gives the `Authorization` header value for a request, or `undefined` for none. */
export type AuthProvider = (url: string) => string | undefined | Promise<string | undefined>;

function statusRetries(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function createHttp(context: ModuleContext<HttpConfig>) {
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

/** API of the `http` module: `game.modules.http`. */
export type Http = ReturnType<typeof createHttp>;

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
