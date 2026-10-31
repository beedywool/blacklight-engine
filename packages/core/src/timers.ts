import type { Unsubscribe } from './events';

/** Opaque timer state from {@link Timers.capture}. */
export interface TimersState {
  readonly now: number;
  readonly timers: readonly (readonly [Timer, number])[];
}

interface Timer {
  id: number;
  /** Game time (ms) when it fires next. */
  at: number;
  /** Repeat interval in ms, 0 for one-shot. */
  every: number;
  callback: () => void;
}

/**
 * Timers counted in game time: they advance with the fixed step, pause with the game and replay
 * identically. Scenes and game objects own one; their timers stop when they are destroyed.
 *
 * @example
 * ```ts
 * this.after(500, () => this.flash());
 * const stop = this.every(1000, () => this.score++);
 * ```
 */
export class Timers {
  /** Game time in milliseconds since this timer list started. */
  now = 0;
  private list: Timer[] = [];
  private nextId = 1;

  /** Calls `callback` once after `ms` milliseconds of game time. */
  after(ms: number, callback: () => void): Unsubscribe {
    return this.add(ms, 0, callback);
  }

  /** Calls `callback` every `ms` milliseconds of game time. */
  every(ms: number, callback: () => void): Unsubscribe {
    if (!(ms > 0)) throw new RangeError(`every() needs a positive interval, got ${ms}`);
    return this.add(ms, ms, callback);
  }

  /** Advances by `ms` and fires the timers that are due, in order. */
  advance(ms: number): void {
    this.now += ms;
    for (;;) {
      let due: Timer | undefined;
      for (const timer of this.list)
        if (timer.at <= this.now && (!due || timer.at < due.at)) due = timer;
      if (!due) return;
      if (due.every > 0) due.at += due.every;
      else this.list = this.list.filter((timer) => timer !== due);
      due.callback();
    }
  }

  /** Cancels every timer. */
  clear(): void {
    this.list = [];
  }

  /** Number of pending timers. */
  get size(): number {
    return this.list.length;
  }

  /**
   * In-memory state for rollback: due times of the current timers. Timers hold callbacks, so this
   * state is not JSON; saves on disk do not include timers.
   */
  capture(): TimersState {
    return { now: this.now, timers: this.list.map((timer) => [timer, timer.at] as const) };
  }

  /** Returns to a state from {@link capture}: timers created since are dropped. */
  restore(state: TimersState): void {
    this.now = state.now;
    this.list = state.timers.map(([timer, at]) => {
      timer.at = at;
      return timer;
    });
  }

  private add(ms: number, every: number, callback: () => void): Unsubscribe {
    const timer: Timer = { id: this.nextId++, at: this.now + Math.max(0, ms), every, callback };
    this.list.push(timer);
    return () => {
      this.list = this.list.filter((t) => t !== timer);
    };
  }
}
