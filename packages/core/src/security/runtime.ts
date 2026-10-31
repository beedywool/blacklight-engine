import type { Unsubscribe } from '../events';
import type { ResolvedSecurity, TamperEvent } from './config';
import { protect, type ProtectedValue } from './protect';

/** What the security runtime needs from the game (structural, so tests can pass a stub). */
export interface SecurityHost {
  /** Steps (value checks) and the `tamper` event. */
  readonly events: {
    /** Listens to fixed steps. */
    on(event: 'step', listener: () => void): Unsubscribe;
    /** Reports tampering to the game's listeners. */
    emit(event: 'tamper', payload: TamperEvent): void;
    /** Number of `tamper` listeners: none means the default reaction. */
    count(event: 'tamper'): number;
  };
  /** The running scene, whose objects and fields hold protected values. */
  readonly scene?: SecurityScene | undefined;
  /** Scenes opened over the running one. */
  readonly overlays?: readonly {
    /** The overlay scene. */
    scene: SecurityScene;
  }[];
  /** The save system, for `save.<field>` paths. */
  readonly save?: {
    /** Current save data. */
    data: object;
  };
  /** Closes the game for `onTamper: 'quit'`. */
  readonly platform: {
    /** Closes the app. */
    quit(): void;
  };
}

interface SecurityScene {
  readonly name: string;
  findAll(name: string): object[];
}

/** Test hooks of {@link SecurityRuntime}: clock, debugger probe, event target. */
export interface SecurityOptions {
  /** Clock for debugger detection (tests). @defaultValue `performance.now` */
  now?: () => number;
  /** Runs the `debugger` statement (tests replace it). */
  probe?: () => void;
  /** Interval between debugger probes in ms. @defaultValue `1000` */
  interval?: number;
  /** Where devtools shortcuts and the context menu are blocked. @defaultValue `window` */
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

/** Steps between two checks of every protected value (reads check them as well). */
const VERIFY_EVERY = 15;
/** A pause longer than this around a `debugger` statement means a debugger is attached. */
const DEBUGGER_THRESHOLD = 100;

function defaultProbe(): void {
  // The statement only stops when developer tools or a debugger are attached; the time it took
  // tells whether it did.
  // eslint-disable-next-line no-debugger
  debugger;
}

/**
 * Runs the in-game measures of release builds: blocked developer-tools shortcuts and context menu
 * (SEC-01), protected values (SEC-05), debugger detection (SEC-06) and the tamper reaction
 * (SEC-09). Installed by the game at startup as `game.security`; `stop()` removes everything.
 *
 * @example
 * ```ts
 * import { SecurityRuntime, resolveSecurity } from '@blacklight/core';
 *
 * const security = new SecurityRuntime(game, resolveSecurity({ protect: ['save.gold'] }, true));
 * security.start();
 * ```
 */
export class SecurityRuntime {
  private readonly watched = new WeakMap<object, Map<string, ProtectedValue>>();
  private readonly active: ProtectedValue[] = [];
  private readonly cleanup: (() => void)[] = [];
  private steps = 0;

  constructor(
    private readonly host: SecurityHost,
    /** The `security` configuration with this build's defaults. */
    readonly settings: ResolvedSecurity,
    private readonly options: SecurityOptions = {},
  ) {}

  /** Starts the enabled measures: value checks, devtools blocking, debugger detection. */
  start(): void {
    const { settings } = this;
    if (settings.protect.length > 0) {
      this.cleanup.push(this.host.events.on('step', () => this.check()));
    }
    if (settings.devtools) this.blockDevtools();
    if (settings.debugger) this.detectDebugger();
  }

  /** Stops every measure and removes its listeners. */
  stop(): void {
    for (const dispose of this.cleanup.splice(0)) dispose();
  }

  /**
   * Reports tampering: `game.on('tamper')` listeners decide; without one, the value is restored
   * and the event logged (and the game closed with `onTamper: 'quit'`).
   */
  tamper(event: TamperEvent): void {
    if (this.host.events.count('tamper') > 0) {
      this.host.events.emit('tamper', event);
      return;
    }
    event.restore();
    console.warn(
      `[blacklight] tamper detected (${event.kind}${event.path ? ` ${event.path}` : ''})${
        event.kind === 'value' ? ': value restored' : ''
      }`,
    );
    if (this.settings.onTamper === 'quit') this.host.platform.quit();
  }

  /** Wraps protected values of new objects and verifies the others every few steps. */
  check(): void {
    for (const path of this.settings.protect) {
      const [head, ...rest] = path.split('.');
      const key = rest.pop()!;
      for (const root of this.roots(head!)) {
        let parent: unknown = root;
        for (const part of rest) parent = (parent as Record<string, unknown> | undefined)?.[part];
        if (typeof parent !== 'object' || parent === null) continue;
        let keys = this.watched.get(parent);
        if (!keys) this.watched.set(parent, (keys = new Map()));
        if (keys.has(key)) continue;
        const value = protect(parent, key, (info) => this.tamper({ kind: 'value', path, ...info }));
        keys.set(key, value);
        this.active.push(value);
      }
    }
    if (++this.steps % VERIFY_EVERY === 0) {
      for (const value of this.active) value.verify();
    }
  }

  private roots(head: string): object[] {
    if (head === 'save') return this.host.save ? [this.host.save.data] : [];
    const scenes = [this.host.scene, ...(this.host.overlays ?? []).map((o) => o.scene)].filter(
      (s): s is SecurityScene => s !== undefined,
    );
    const scene = scenes.find((s) => s.name === head);
    if (scene) return [scene];
    return scenes.flatMap((s) => s.findAll(head));
  }

  private blockDevtools(): void {
    const target = this.options.target ?? (typeof window === 'undefined' ? undefined : window);
    if (!target) return;
    const onKey = (event: Event) => {
      const e = event as KeyboardEvent;
      const mod = e.ctrlKey || e.metaKey;
      const inspect = mod && (e.shiftKey || e.altKey) && ['KeyI', 'KeyJ', 'KeyC'].includes(e.code);
      if (e.code === 'F12' || inspect || (mod && e.code === 'KeyU')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onMenu = (event: Event) => event.preventDefault();
    target.addEventListener('keydown', onKey, { capture: true });
    target.addEventListener('contextmenu', onMenu, { capture: true });
    this.cleanup.push(() => {
      target.removeEventListener('keydown', onKey, { capture: true });
      target.removeEventListener('contextmenu', onMenu, { capture: true });
    });
  }

  private detectDebugger(): void {
    const now = this.options.now ?? (() => performance.now());
    const probe = this.options.probe ?? defaultProbe;
    let reported = false;
    const timer = setInterval(() => {
      const start = now();
      probe();
      const paused = now() - start > DEBUGGER_THRESHOLD;
      if (paused && !reported) this.tamper({ kind: 'debugger', restore: () => undefined });
      reported = paused;
    }, this.options.interval ?? 1000);
    this.cleanup.push(() => clearInterval(timer));
  }
}
