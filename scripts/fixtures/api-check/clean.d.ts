/**
 * Moves a value towards a target by at most `step`.
 *
 * @example
 * ```ts
 * approach(0, 10, 3); // 3
 * ```
 */
export declare function approach(value: number, target: number, step: number): number;

/**
 * A counter that games read every frame.
 *
 * @example
 * ```ts
 * const counter = new Counter();
 * counter.add(2);
 * ```
 */
export declare class Counter {
  /** Current value. */
  get value(): number;
  set value(next: number);
  /** Adds `amount` to the value. */
  add(amount: number): void;
  /** Not part of the public API. @internal */
  reset(): void;
}

/** Options of {@link approach}-style helpers. */
export interface StepOptions {
  /** Largest change per call. */
  step: number;
  /** Values read by the caller, typed precisely. */
  values: Record<string, unknown>;
}

/** @internal */
export declare function internalHelper(value: any): any;
