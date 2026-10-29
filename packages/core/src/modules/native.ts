import type { Platform } from '../platform';

/**
 * Game-side API of a native part made with `defineNative` (`@blacklight/native`): every exposed
 * function, returning a promise. Built from the definition's type only, so importing it with
 * `import type` keeps Node code out of the game bundle.
 */
export type NativeApi<D> = D extends { readonly functions: infer F }
  ? {
      [K in keyof F]: F[K] extends { run(context: never, ...args: infer A): infer R }
        ? (...args: A) => Promise<Awaited<R>>
        : never;
    }
  : never;

/**
 * Typed calls to a native part (MOD-03) through `platform.invoke`: the Electron main process on
 * desktop, the Capacitor plugin of the same name on mobile, a web fallback in browsers. Only the
 * functions the definition exposes exist; the native side validates every argument again.
 *
 * @example
 * ```ts
 * import type { sqliteNative } from './native'; // type only: no Node code in the game
 *
 * const db = nativeModule<typeof sqliteNative>(context.platform, 'sqlite');
 * await db.open('game.db');
 * ```
 */
export function nativeModule<D>(platform: Platform, name: string): NativeApi<D> {
  return new Proxy({} as NativeApi<D> & object, {
    get(_, method) {
      if (typeof method !== 'string' || method === 'then') return undefined;
      return (...args: unknown[]) => platform.invoke(name, method, ...args);
    },
  });
}
