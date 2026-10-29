import { EventBus, type Unsubscribe } from '../events';
import type { PlatformFiles } from '../platform';

/** Online state as modules see it. */
export interface NetworkEvents {
  online: void;
  offline: void;
}

/** Options of an {@link OfflineQueue}. */
export interface QueueOptions {
  /** First retry delay in ms; doubles after each failure. @defaultValue `1000` */
  retryDelay?: number;
  /** Longest delay between retries in ms. @defaultValue `300000` (5 minutes) */
  maxDelay?: number;
  /** Attempts before an item is dropped; `0` keeps it forever. @defaultValue `0` */
  maxAttempts?: number;
  /** Items kept at most; the oldest are dropped first. @defaultValue `1000` */
  maxItems?: number;
}

/**
 * Throw it from a queue handler when retrying cannot help (the server refused the data): the item
 * is dropped instead of being sent again.
 *
 * @example
 * ```ts
 * if (response.status === 400) throw new DropItem('the server refused the score');
 * ```
 */
export class DropItem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropItem';
  }
}

interface StoredItem<T> {
  id: string;
  item: T;
  attempts: number;
  added: number;
}

/** Events of an {@link OfflineQueue}. */
export interface QueueEvents<T> {
  /** An item was delivered. */
  sent: { item: T; attempts: number };
  /** An attempt failed; the item stays queued (`willRetry`) or is dropped. */
  failed: { item: T; error: unknown; attempts: number; willRetry: boolean };
  /** Everything queued was delivered. */
  drained: void;
}

/**
 * Work that must reach a server eventually: items are written to the device first, then handed to
 * the handler in order. A failure keeps the item and retries with exponential backoff; going
 * online, resuming the app or calling {@link flush} retries at once. Items survive restarts.
 *
 * @example
 * ```ts
 * const scores = context.network.queue<{ points: number }>('scores', async ({ points }) => {
 *   const response = await fetch('/scores', { method: 'POST', body: JSON.stringify({ points }) });
 *   if (!response.ok) throw new Error(`HTTP ${response.status}`);
 * });
 * await scores.push({ points: 1200 }); // sent now, or later when back online
 * ```
 */
export class OfflineQueue<T> {
  readonly events = new EventBus<QueueEvents<T>>();
  private items: StoredItem<T>[] = [];
  private readonly loaded: Promise<void>;
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private stopped = false;
  private again = false;
  private counter = 0;
  private readonly options: Required<QueueOptions>;

  constructor(
    private readonly file: string,
    private readonly handler: (item: T) => Promise<void>,
    private readonly network: Network,
    private readonly files: PlatformFiles,
    options: QueueOptions = {},
  ) {
    this.options = {
      retryDelay: options.retryDelay ?? 1000,
      maxDelay: options.maxDelay ?? 300_000,
      maxAttempts: options.maxAttempts ?? 0,
      maxItems: options.maxItems ?? 1000,
    };
    this.loaded = this.load();
  }

  /** Items waiting to be delivered. */
  get size(): number {
    return this.items.length;
  }

  /** Copies of the waiting items, oldest first. */
  pending(): T[] {
    return this.items.map((entry) => entry.item);
  }

  /** Stores `item` and tries to deliver it (right away when online). */
  async push(item: T): Promise<void> {
    await this.loaded;
    this.items.push({
      id: `${Date.now().toString(36)}-${(this.counter++).toString(36)}`,
      item,
      attempts: 0,
      added: Date.now(),
    });
    if (this.items.length > this.options.maxItems)
      this.items.splice(0, this.items.length - this.options.maxItems);
    await this.persist();
    void this.flush();
  }

  /**
   * Delivers the waiting items now, in order, and resolves when the queue is empty or an item
   * failed (the next retry is then scheduled).
   */
  flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      // The pass in progress may already have decided it was offline: run another one after it.
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.run();
      } while (this.again && !this.stopped);
    })().finally(() => (this.running = undefined));
    return this.running;
  }

  /** Removes every waiting item. */
  async clear(): Promise<void> {
    await this.loaded;
    this.items = [];
    await this.persist();
  }

  /** Stops retrying (on shutdown); items stay stored for the next run. */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private async run(): Promise<void> {
    await this.loaded;
    clearTimeout(this.timer);
    this.timer = undefined;
    // Without a connection the 'online' event flushes again; after failed requests the backoff
    // timer keeps probing, since browsers do not announce a server coming back.
    if (!this.network.connected) return;
    while (this.items.length > 0 && !this.stopped) {
      const entry = this.items[0]!;
      entry.attempts++;
      try {
        await this.handler(entry.item);
      } catch (error) {
        const drop =
          error instanceof DropItem ||
          (this.options.maxAttempts > 0 && entry.attempts >= this.options.maxAttempts);
        this.events.emit('failed', {
          item: entry.item,
          error,
          attempts: entry.attempts,
          willRetry: !drop,
        });
        if (drop) {
          this.items.shift();
          await this.persist();
          continue;
        }
        if (isNetworkError(error)) this.network.reportFailure();
        await this.persist();
        this.schedule();
        return;
      }
      this.failures = 0;
      this.network.reportSuccess();
      this.items.shift();
      await this.persist();
      this.events.emit('sent', { item: entry.item, attempts: entry.attempts });
    }
    if (this.items.length === 0) this.events.emit('drained');
  }

  private schedule(): void {
    if (this.stopped) return;
    const delay = Math.min(this.options.retryDelay * 2 ** this.failures, this.options.maxDelay);
    this.failures++;
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  private async load(): Promise<void> {
    try {
      const data = await this.files.read(this.file);
      if (!data) return;
      const stored = JSON.parse(new TextDecoder().decode(data)) as StoredItem<T>[];
      if (Array.isArray(stored)) this.items = [...stored, ...this.items];
    } catch {
      // A damaged queue file must not stop the game; its items are lost.
    }
  }

  private async persist(): Promise<void> {
    await this.files.write(this.file, new TextEncoder().encode(JSON.stringify(this.items)));
  }
}

/** `fetch` rejects with a `TypeError` when the request never reached a server. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error as { name?: string } | null)?.name === 'NetworkError';
}

/** `context.network`: the game's {@link Network}, queues stored in the module's folder. */
export type ModuleNetwork = Pick<
  Network,
  'online' | 'connected' | 'on' | 'reportFailure' | 'reportSuccess' | 'flushAll' | 'queue'
>;

/**
 * Online state and offline queues, shared by every module of a game (`context.network`). The
 * state follows the browser (`navigator.onLine` and its events) and the results of queued
 * requests: a request that cannot reach its server marks the game offline until one succeeds or
 * the browser reports a connection.
 */
export class Network {
  readonly events = new EventBus<NetworkEvents>();
  private browserOnline: boolean;
  private failing = false;
  private readonly queues = new Set<{ flush(): Promise<void>; stop(): void }>();
  private readonly cleanup: Unsubscribe[] = [];

  constructor(private readonly files: PlatformFiles) {
    this.browserOnline = globalThis.navigator?.onLine ?? true;
    const target = globalThis as { addEventListener?: typeof addEventListener };
    if (target.addEventListener) {
      const online = () => this.setBrowserOnline(true);
      const offline = () => this.setBrowserOnline(false);
      target.addEventListener('online', online);
      target.addEventListener('offline', offline);
      this.cleanup.push(() => {
        globalThis.removeEventListener?.('online', online);
        globalThis.removeEventListener?.('offline', offline);
      });
    }
  }

  /** `true` when requests are expected to reach the network. */
  get online(): boolean {
    return this.browserOnline && !this.failing;
  }

  /** `true` when the device reports a network connection (requests may still fail). */
  get connected(): boolean {
    return this.browserOnline;
  }

  /** Listens to `online` / `offline` changes. */
  on(event: keyof NetworkEvents, listener: () => void): Unsubscribe {
    return this.events.on(event, listener);
  }

  /**
   * Creates a persistent queue (stored as `<file>`) delivered by `handler`. Module contexts
   * prefix the file with the module's folder.
   */
  queue<T>(
    file: string,
    handler: (item: T) => Promise<void>,
    options?: QueueOptions,
  ): OfflineQueue<T> {
    const queue = new OfflineQueue<T>(file, handler, this, this.files, options);
    this.queues.add(queue);
    void queue.flush();
    return queue;
  }

  /** Retries every queue now (also called when the app resumes). */
  async flushAll(): Promise<void> {
    await Promise.all([...this.queues].map((queue) => queue.flush()));
  }

  /** A request could not reach its server. */
  reportFailure(): void {
    const was = this.online;
    this.failing = true;
    if (was) this.events.emit('offline');
  }

  /** A request reached its server. */
  reportSuccess(): void {
    const was = this.online;
    this.failing = false;
    if (!was && this.online) {
      this.events.emit('online');
      void this.flushAll();
    }
  }

  /** @internal Browser connectivity changed. */
  setBrowserOnline(online: boolean): void {
    const was = this.online;
    this.browserOnline = online;
    // A new connection is a reason to try again even if the last request failed.
    if (online) this.failing = false;
    if (was !== this.online) this.events.emit(this.online ? 'online' : 'offline');
    if (online) void this.flushAll();
  }

  /** Stops every queue and listener. */
  dispose(): void {
    for (const queue of this.queues) queue.stop();
    for (const off of this.cleanup) off();
    this.events.clear();
  }
}
