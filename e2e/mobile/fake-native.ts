// A stand-in for Capacitor's native side, injected before the page loads: the same JavaScript
// bridge calls a phone answers (`Capacitor.nativePromise` / `nativeCallback`), backed by
// localStorage so a reload behaves like an app restart. Lets the mobile bundle run in desktop
// Chromium with touch emulation.

/** Runs in the page (serialized by Playwright's addInitScript). */
export function installFakeNative(appId: string): void {
  type Options = Record<string, unknown>;
  type Listener = (data: unknown) => void;
  const w = window as unknown as Record<string, unknown>;
  const calls: [string, Options | undefined][] = [];
  const listeners = new Map<string, Map<string, Listener>>();
  let nextId = 1;
  const fail = (message: string, code?: string) => Object.assign(new Error(message), { code });
  const store = (prefix: string) => ({
    get: (key: string) => localStorage.getItem(`${prefix}${key}`),
    set: (key: string, value: string) => localStorage.setItem(`${prefix}${key}`, value),
    remove: (key: string) => localStorage.removeItem(`${prefix}${key}`),
    keys: () =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
  });
  const files = store('fake-native:file:');
  const secure = store('fake-native:secure:');
  const notFound = (path: string) => fail(`File does not exist: ${path}`, 'OS-PLUG-FILE-0008');
  const ok = async () => undefined;

  const plugins: Record<string, Record<string, (o: Options) => unknown>> = {
    Filesystem: {
      readFile: ({ path }) => {
        const data = files.get(String(path));
        if (data === null) throw notFound(String(path));
        return { data };
      },
      writeFile: ({ path, data }) => (files.set(String(path), String(data)), { uri: path }),
      deleteFile: ({ path }) => {
        if (files.get(String(path)) === null) throw notFound(String(path));
        files.remove(String(path));
      },
      readdir: ({ path }) => {
        const prefix = `${String(path)}/`;
        const names = new Map<string, string>();
        for (const key of files.keys()) {
          if (!key.startsWith(prefix)) continue;
          const parts = key.slice(prefix.length).split('/');
          names.set(parts[0]!, parts.length > 1 ? 'directory' : 'file');
        }
        if (names.size === 0) throw notFound(String(path));
        return { files: [...names].map(([name, type]) => ({ name, type })) };
      },
      rename: ({ from, to }) => {
        const data = files.get(String(from));
        if (data === null) throw notFound(String(from));
        files.set(String(to), data);
        files.remove(String(from));
      },
      getUri: ({ path }) => ({ uri: `file:///data/user/0/${appId}/files/${String(path)}` }),
    },
    SecureStoragePlugin: {
      get: ({ key }) => {
        const value = secure.get(String(key));
        if (value === null) throw fail('Item with given key does not exist');
        return { value };
      },
      set: ({ key, value }) => (secure.set(String(key), String(value)), { value: true }),
      remove: ({ key }) => (secure.remove(String(key)), { value: true }),
      keys: () => ({ value: secure.keys() }),
    },
    App: {
      exitApp: ok,
      minimizeApp: ok,
      getInfo: () => ({ id: appId, name: 'Fake', version: '1.0.0', build: '1' }),
      getLaunchUrl: () => undefined,
    },
    Haptics: {
      impact: ok,
      notification: ok,
      vibrate: ok,
      selectionStart: ok,
      selectionChanged: ok,
      selectionEnd: ok,
    },
    KeepAwake: { keepAwake: ok, allowSleep: ok, isSupported: () => ({ isSupported: true }) },
    ScreenOrientation: { lock: ok, unlock: ok, orientation: () => ({ type: 'landscape-primary' }) },
    SystemBars: { hide: ok, show: ok, setStyle: ok, setAnimation: ok },
    Browser: { open: ok, close: ok },
    BlacklightGames: {
      signIn: () => ({ authenticated: true, playerId: 'fake', displayName: 'Fake Player' }),
      unlock: ok,
      progress: ok,
      show: ok,
    },
  };

  const methods = (name: string) => [
    ...Object.keys(plugins[name]!).map((m) => ({ name: m, rtype: 'promise' })),
    { name: 'addListener', rtype: 'callback' },
    { name: 'removeListener', rtype: 'promise' },
    { name: 'removeAllListeners', rtype: 'promise' },
  ];

  w.androidBridge = { postMessage: () => {} };
  w.Capacitor = {
    PluginHeaders: Object.keys(plugins).map((name) => ({ name, methods: methods(name) })),
    nativePromise(plugin: string, method: string, options?: Options) {
      calls.push([`${plugin}.${method}`, options]);
      if (method === 'removeListener') {
        listeners
          .get(`${plugin}.${String(options?.eventName)}`)
          ?.delete(String(options?.callbackId));
        return Promise.resolve();
      }
      const fn = plugins[plugin]?.[method];
      if (!fn)
        return Promise.reject(
          fail(`"${plugin}.${method}()" is not implemented on android`, 'UNIMPLEMENTED'),
        );
      try {
        return Promise.resolve(fn(options ?? {}));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    nativeCallback(plugin: string, method: string, options: Options, callback: Listener) {
      calls.push([`${plugin}.${method}`, options]);
      const id = String(nextId++);
      const event = `${plugin}.${String(options.eventName)}`;
      if (!listeners.has(event)) listeners.set(event, new Map());
      listeners.get(event)!.set(id, callback);
      return id;
    },
  };
  /** Fires a native event: `__fireNative('App', 'backButton', { canGoBack: false })`. */
  w.__fireNative = (plugin: string, event: string, data: unknown = {}) => {
    for (const listener of listeners.get(`${plugin}.${event}`)?.values() ?? []) listener(data);
  };
  w.__nativeCalls = calls;
}
