// Main-process parts of game modules (MOD-03), the `secure-storage` module and deep links.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isNativeModule, type NativeContext, type NativeModule } from '../define-native';
import type { SafeStorageLike } from './keystore';
import { emitToGame, method, registerDispatcher, registerNative } from './registry';
import { v } from './validate';

/**
 * Registers the exports of a native-part file: every `defineNative` module it exports (named or
 * default), or a function receiving the registration API for hand-written modules.
 *
 * @returns The modules registered, to set up and dispose.
 * @throws Error when the file exports nothing the app can use.
 */
export function registerNativeExports(
  file: string,
  exported: unknown,
  api: Record<string, unknown>,
): NativeModule[] {
  const record = (exported ?? {}) as Record<string, unknown>;
  const found = new Set<NativeModule>();
  for (const value of [exported, record.default, ...Object.values(record)]) {
    if (isNativeModule(value)) found.add(value);
  }
  if (found.size === 0) {
    const fn = typeof exported === 'function' ? exported : record.default;
    if (typeof fn === 'function') {
      (fn as (api: Record<string, unknown>) => void)(api);
      return [];
    }
    throw new Error(
      `${file} exports no native module: export the result of defineNative({ name, functions }) from @blacklight/native.`,
    );
  }
  return [...found];
}

/** Sets up `defineNative` modules and routes calls to their `call`, which validates arguments. */
export async function startNativeModules(
  list: NativeModule[],
  context: NativeContext,
): Promise<() => Promise<void>> {
  const started: NativeModule[] = [];
  const unregister: (() => void)[] = [];
  for (const module of list) {
    await module.setup?.(context);
    unregister.push(
      registerDispatcher(module.name, module.methods, (name, args) =>
        module.call(name, args, context),
      ),
    );
    started.push(module);
  }
  return async () => {
    for (const off of unregister) off();
    for (const module of started.reverse()) await module.dispose?.(context);
  };
}

/**
 * `secure-storage` on desktop: small secrets (refresh tokens) encrypted by the OS keystore through
 * Electron's `safeStorage`, in one file outside the page's data folder. Same methods as the mobile
 * plugin: `get(key) → string | null`, `set(key, value)`, `remove(key)`.
 */
export function startSecureStorage(
  file: string,
  storage: SafeStorageLike,
  warn: (message: string) => void = console.warn,
): () => void {
  // First byte: 1 = encrypted by the OS keystore, 0 = plain JSON (no keystore, like the save key).
  let cache: Promise<Record<string, string>> | undefined;
  const load = () =>
    (cache ??= readFile(file)
      .then((data) => {
        const body = data.subarray(1);
        const text = data[0] === 1 ? storage.decryptString(body) : body.toString('utf8');
        return JSON.parse(text) as Record<string, string>;
      })
      .catch(() => ({}) as Record<string, string>));
  let warned = false;
  const save = async (values: Record<string, string>) => {
    const json = JSON.stringify(values);
    let data: Buffer;
    if (storage.isEncryptionAvailable()) {
      data = Buffer.concat([Buffer.from([1]), storage.encryptString(json)]);
    } else {
      if (!warned) {
        warned = true;
        warn(
          '[blacklight] No OS keystore available (safeStorage): secure-storage values are stored unencrypted, readable by this user only.',
        );
      }
      data = Buffer.concat([Buffer.from([0]), Buffer.from(json)]);
    }
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, data, { mode: 0o600 });
    await rename(temp, file);
  };
  const key = v.string({ min: 1, max: 256 });
  return registerNative('secure-storage', {
    get: method([key], async (name) => (await load())[name] ?? null),
    set: method([key, v.string({ max: 64 * 1024 })], async (name, value) => {
      const values = { ...(await load()), [name]: value };
      cache = Promise.resolve(values);
      await save(values);
    }),
    remove: method([key], async (name) => {
      const values = { ...(await load()) };
      delete values[name];
      cache = Promise.resolve(values);
      await save(values);
    }),
  });
}

/** Deep links (`<game id>:/oauth/callback?code=…`): kept until the game listens, then sent as `deeplink`. */
export class DeepLinks {
  private readonly pending: string[] = [];
  private ready = false;

  constructor(readonly scheme: string) {
    registerNative('deeplinks', {
      // The page subscribes after startup; links that opened the app wait here until then.
      take: method([], () => {
        this.ready = true;
        return this.pending.splice(0);
      }),
    });
  }

  /** Links found in a command line (Windows and Linux pass them as arguments). */
  fromArgv(argv: readonly string[]): void {
    for (const arg of argv) if (arg.toLowerCase().startsWith(`${this.scheme}:`)) this.receive(arg);
  }

  receive(url: string): void {
    if (this.ready) emitToGame('deeplink', { url });
    else this.pending.push(url);
  }
}
