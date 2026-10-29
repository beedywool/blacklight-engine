/** Map of event name → payload type. `void` means the event has no payload. */
export type EventMap = Record<string, unknown>;

type Listener<T> = (payload: T) => void;

/** Something that removes a listener, a timer or any other subscription. */
export type Unsubscribe = () => void;

/**
 * Typed event bus. The game has a global bus (`game.events`) and each scene its own
 * (`scene.events`), cleared when the scene ends.
 *
 * @example
 * ```ts
 * const events = new EventBus<{ scored: number; 'game-over': void }>();
 * const off = events.on('scored', (points) => console.log(points));
 * events.emit('scored', 10);
 * off();
 * ```
 */
export class EventBus<Events extends object = EventMap> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Calls `listener` every time `name` is emitted. Returns a function that removes it. */
  on<K extends keyof Events>(name: K, listener: Listener<Events[K]>): Unsubscribe {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener as Listener<never>);
    return () => this.off(name, listener);
  }

  /** Like {@link on}, but the listener runs once. */
  once<K extends keyof Events>(name: K, listener: Listener<Events[K]>): Unsubscribe {
    const off = this.on(name, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(name: K, listener: Listener<Events[K]>): void {
    this.listeners.get(name)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(
    name: K,
    ...payload: Events[K] extends void ? [] : [Events[K]]
  ): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) (listener as Listener<unknown>)(payload[0]);
  }

  /** Number of listeners for `name`, or for every event. */
  count(name?: keyof Events): number {
    if (name !== undefined) return this.listeners.get(name)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  /** Removes every listener. */
  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Collects unsubscribe functions and runs them all at once. Scenes and game objects own one, so
 * their listeners and timers stop when they are destroyed.
 */
export class Disposables {
  private readonly items = new Set<Unsubscribe>();

  add(dispose: Unsubscribe): Unsubscribe {
    this.items.add(dispose);
    return () => {
      this.items.delete(dispose);
      dispose();
    };
  }

  dispose(): void {
    const items = [...this.items];
    this.items.clear();
    for (const dispose of items) dispose();
  }
}
