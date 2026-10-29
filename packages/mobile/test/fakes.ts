import type { MobilePlugins } from '../src/plugins';

class NotFound extends Error {
  code = 'OS-PLUG-FILE-0008';
  constructor(path: string) {
    super(`File does not exist: ${path}`);
  }
}

/** Calls made to fake plugins, in order: `"plugin.method"` with the options. */
export type CallLog = [string, unknown][];

export interface FakeDevice {
  plugins: MobilePlugins;
  calls: CallLog;
  /** File contents by full path (base64), shared across restarts. */
  files: Map<string, string>;
  secure: Map<string, string>;
  /** Fires an `@capacitor/app` event (`backButton`, `pause`, `resume`, `appUrlOpen`). */
  fire(event: string, payload?: unknown): void;
  /** Rows the fake SQLite plugin answers to `query`. */
  rows: Record<string, unknown>[];
  /** Capacitor plugins installed in the app besides the built-in ones. */
  extra: Record<string, Record<string, (options?: object) => Promise<unknown>>>;
}

/**
 * In-memory Capacitor plugins that behave like the native ones where it matters: `rename` refuses
 * to replace a file on iOS, missing files reject with the Filesystem not-found code, secure
 * storage rejects unknown keys.
 */
export function fakeDevice(
  platform: 'android' | 'ios' = 'android',
  shared?: Pick<FakeDevice, 'files' | 'secure'>,
): FakeDevice {
  const calls: CallLog = [];
  const files = shared?.files ?? new Map<string, string>();
  const secure = shared?.secure ?? new Map<string, string>();
  const listeners = new Map<string, ((payload: never) => void)[]>();
  const log = (name: string, options?: unknown) => calls.push([name, options]);
  const device: FakeDevice = {
    calls,
    files,
    secure,
    rows: [],
    extra: {},
    fire(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload as never);
    },
    plugins: {
      platform,
      dataDirectory: 'DATA',
      filesystem: {
        async readFile({ path }) {
          const data = files.get(path);
          if (data === undefined) throw new NotFound(path);
          return { data };
        },
        async writeFile({ path, data }) {
          log('filesystem.writeFile', path);
          files.set(path, data);
          return { uri: path };
        },
        async deleteFile({ path }) {
          if (!files.delete(path)) throw new NotFound(path);
        },
        async readdir({ path }) {
          const prefix = `${path}/`;
          const names = new Map<string, 'file' | 'directory'>();
          for (const key of files.keys()) {
            if (!key.startsWith(prefix)) continue;
            const [first, ...rest] = key.slice(prefix.length).split('/');
            names.set(first!, rest.length > 0 ? 'directory' : 'file');
          }
          if (names.size === 0) throw new NotFound(path);
          return { files: [...names].map(([name, type]) => ({ name, type })) };
        },
        async rename({ from, to }) {
          log('filesystem.rename', { from, to });
          const data = files.get(from);
          if (data === undefined) throw new NotFound(from);
          if (platform === 'ios' && files.has(to)) throw new Error('File already exists');
          files.set(to, data);
          files.delete(from);
        },
        async getUri({ path }) {
          return { uri: `file:///data/user/0/com.example.test/files/${path}` };
        },
      },
      secureStorage: {
        async get({ key }) {
          const value = secure.get(key);
          if (value === undefined) throw new Error('Item with given key does not exist');
          return { value };
        },
        async set({ key, value }) {
          log('secureStorage.set', key);
          secure.set(key, value);
          return { value: true };
        },
        async remove({ key }) {
          if (!secure.delete(key)) throw new Error('Item with given key does not exist');
          return { value: true };
        },
        async keys() {
          return { value: [...secure.keys()] };
        },
      },
      app: {
        async addListener(event, listener) {
          listeners.set(event, [...(listeners.get(event) ?? []), listener]);
          return {
            remove: async () => {
              listeners.set(
                event,
                (listeners.get(event) ?? []).filter((l) => l !== listener),
              );
            },
          };
        },
        exitApp: async () => void log('app.exitApp'),
        minimizeApp: async () => void log('app.minimizeApp'),
        getInfo: async () => ({
          id: 'com.example.test',
          name: 'Test',
          version: '1.0.0',
          build: '1',
        }),
        getLaunchUrl: async () => undefined,
      },
      haptics: {
        impact: async (options) => void log('haptics.impact', options),
        notification: async (options) => void log('haptics.notification', options),
        vibrate: async (options) => void log('haptics.vibrate', options),
        selectionStart: async () => void log('haptics.selectionStart'),
        selectionChanged: async () => void log('haptics.selectionChanged'),
        selectionEnd: async () => void log('haptics.selectionEnd'),
      },
      keepAwake: {
        keepAwake: async () => void log('keepAwake.keepAwake'),
        allowSleep: async () => void log('keepAwake.allowSleep'),
      },
      screenOrientation: {
        lock: async (options) => void log('screenOrientation.lock', options),
        unlock: async () => void log('screenOrientation.unlock'),
      },
      systemBars: {
        hide: async () => void log('systemBars.hide'),
        show: async () => void log('systemBars.show'),
      },
      browser: { open: async (options) => void log('browser.open', options) },
      sqlite: {
        createConnection: async (options) => void log('sqlite.createConnection', options),
        checkConnectionsConsistency: async (options) =>
          void log('sqlite.checkConnectionsConsistency', options),
        open: async (options) => void log('sqlite.open', options),
        close: async (options) => void log('sqlite.close', options),
        closeConnection: async (options) => void log('sqlite.closeConnection', options),
        async execute(options) {
          log('sqlite.execute', options);
          return { changes: { changes: 0, lastId: 0 } };
        },
        async run(options) {
          log('sqlite.run', options);
          return { changes: { changes: 1, lastId: 7 } };
        },
        async query(options) {
          log('sqlite.query', options);
          return { values: device.rows };
        },
      },
      games: {
        signIn: async () => ({ authenticated: true, playerId: 'p1', displayName: 'Ada' }),
        unlock: async (options) => void log('games.unlock', options),
        progress: async (options) => void log('games.progress', options),
        show: async () => void log('games.show'),
        submitScore: async (options) => void log('games.submitScore', options),
        scores: async (options) => {
          log('games.scores', options);
          return { entries: [{ rank: 1, name: 'Ada', score: 900 }] };
        },
      },
      plugin: (name) => device.extra[name],
    },
  };
  return device;
}
