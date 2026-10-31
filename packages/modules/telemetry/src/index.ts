import { DropItem, defineModule, t, type ModuleContext, type Schema } from '@blacklight/core';
import { DEFAULT_CONSENT_TEXTS, consentDialog, type ConsentTexts } from './consent';
import {
  TELEMETRY_VERSION,
  envelope,
  eventId,
  exceptionOf,
  parseDsn,
  type Dsn,
  type Level,
  type SentryEvent,
} from './sentry';

export { DEFAULT_CONSENT_TEXTS, consentDialog, type ConsentTexts } from './consent';
export {
  TELEMETRY_VERSION,
  parseDsn,
  parseStack,
  scrubFilename,
  type Dsn,
  type Frame,
  type Level,
  type SentryEvent,
} from './sentry';

/** Options of the `telemetry` module in `game.config.ts`, with their defaults applied. */
export interface TelemetryConfig {
  /** Sentry DSN from the project settings of Sentry or GlitchTip; without it nothing is recorded. */
  dsn: string | undefined;
  /** `environment` of events. Unset: `development` in `blacklight dev`, `production` otherwise. */
  environment: string | undefined;
  /** `release` of events. Unset: `<game id>@<game version>`. */
  release: string | undefined;
  /** Share of events sent, 0 to 1 (crashes and usage events alike). @defaultValue `1` */
  sampleRate: number;
  /** Report uncaught errors and unhandled promise rejections. @defaultValue `true` */
  crashes: boolean;
  /** Send usage events from `track()`. @defaultValue `true` */
  events: boolean;
  /**
   * Breadcrumbs (scene changes, `breadcrumb()`) kept and attached to each event, 0 to 100.
   * @defaultValue `20`
   */
  maxBreadcrumbs: number;
  /** Texts of the consent question. @defaultValue {@link DEFAULT_CONSENT_TEXTS} */
  consent: ConsentTexts;
}

/**
 * What `game.config.ts` may write under `modules.telemetry`: every option is optional, and so is
 * each consent text.
 */
export type TelemetryConfigInput = Partial<Omit<TelemetryConfig, 'consent'>> & {
  /** Texts of the consent question; missing ones keep the English defaults. */
  consent?: Partial<ConsentTexts>;
};

const config: Schema<TelemetryConfig, TelemetryConfigInput> = t.object({
  dsn: t.string({ url: true }).optional(),
  environment: t.string({ min: 1 }).optional(),
  release: t.string({ min: 1 }).optional(),
  sampleRate: t.number({ min: 0, max: 1 }).default(1),
  crashes: t.boolean().default(true),
  events: t.boolean().default(true),
  maxBreadcrumbs: t.number({ integer: true, min: 0, max: 100 }).default(20),
  consent: t
    .object({
      title: t.string().default(DEFAULT_CONSENT_TEXTS.title),
      message: t.string().default(DEFAULT_CONSENT_TEXTS.message),
      allow: t.string().default(DEFAULT_CONSENT_TEXTS.allow),
      deny: t.string().default(DEFAULT_CONSENT_TEXTS.deny),
    })
    .default({ ...DEFAULT_CONSENT_TEXTS }),
});

/** The player's answer: nothing is recorded until it is `granted`. */
export type Consent = 'unknown' | 'granted' | 'denied';

/** Extra values attached to an event. */
export type Extra = Record<string, string | number | boolean>;

/** Options of `askConsent`. */
export interface AskConsentOptions {
  /** Shows your own consent screen and resolves with the player's choice. */
  ask?: (texts: ConsentTexts) => Promise<boolean>;
  /** Asks again even if the player already answered (a settings screen). */
  force?: boolean;
}

interface Queued {
  url: string;
  body: string;
}

const RUNTIME: Record<string, string> = {
  web: 'browser',
  desktop: 'electron',
  android: 'webview',
  ios: 'webview',
};

function createTelemetry(context: ModuleContext<TelemetryConfig>) {
  const { config, game, platform, storage, log } = context;
  let dsn: Dsn | undefined;
  if (config.dsn) dsn = parseDsn(config.dsn);
  else if (context.dev) log.info('no `dsn` set: telemetry records nothing.');
  let consent: Consent = 'unknown';
  const breadcrumbs: NonNullable<SentryEvent['breadcrumbs']> = [];
  const release = config.release ?? `${game.config.id}@${game.config.version}`;
  const environment = config.environment ?? (context.dev ? 'development' : 'production');

  const queue = context.network.queue<Queued>('events', async ({ url, body }) => {
    const response = await fetch(url, {
      method: 'POST',
      // text/plain keeps the request "simple" (no CORS preflight), like the Sentry browser SDK.
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body,
    });
    if (response.ok) return;
    const retry = response.status === 408 || response.status === 429 || response.status >= 500;
    if (!retry)
      throw new DropItem(`the telemetry backend refused an event (HTTP ${response.status})`);
    throw new Error(`the telemetry backend answered HTTP ${response.status}; retrying later`);
  });

  const active = () => consent === 'granted' && dsn !== undefined;

  const send = async (event: Omit<SentryEvent, keyof Base>): Promise<string | undefined> => {
    if (!active() || Math.random() >= config.sampleRate) return undefined;
    const full: SentryEvent = { ...base(), ...event };
    await queue.push({ url: dsn!.envelopeUrl, body: envelope(dsn!, full) });
    return full.event_id;
  };

  type Base = Pick<
    SentryEvent,
    | 'event_id'
    | 'timestamp'
    | 'platform'
    | 'release'
    | 'environment'
    | 'tags'
    | 'contexts'
    | 'sdk'
    | 'breadcrumbs'
  >;
  // Only what describes the build and the platform: no user, device name, IP or page URL.
  const base = (): Base => ({
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    release,
    environment,
    tags: { platform: platform.name, ...(platform.steam ? { steam: 'true' } : {}) },
    contexts: {
      app: { app_identifier: game.config.id, app_version: game.config.version },
      runtime: { name: RUNTIME[platform.name] ?? 'browser' },
    },
    ...(breadcrumbs.length > 0 ? { breadcrumbs: [...breadcrumbs] } : {}),
    sdk: {
      name: 'blacklight.telemetry',
      version: TELEMETRY_VERSION,
      settings: { infer_ip: 'never' },
    },
  });

  const api = {
    /** The player's answer so far. */
    get consent(): Consent {
      return consent;
    },
    /** Events stored on the device and not delivered yet. */
    get pending(): number {
      return queue.size;
    },
    /**
     * Records the player's answer. Refusing also deletes the events waiting to be sent.
     */
    async setConsent(granted: boolean): Promise<void> {
      consent = granted ? 'granted' : 'denied';
      await storage.set('consent', consent);
      if (!granted) {
        breadcrumbs.length = 0;
        await queue.clear();
      }
    },
    /**
     * Asks the player once, then remembers the answer: with your `ask` screen, else the UI
     * layer's confirm dialog, else a minimal built-in dialog. Resolves with `true` when granted.
     *
     * @throws Error when there is no way to show a question (no UI, no DOM): pass `ask`.
     */
    async askConsent(options: AskConsentOptions = {}): Promise<boolean> {
      if (consent !== 'unknown' && !options.force) return consent === 'granted';
      const texts = config.consent;
      let granted: boolean;
      if (options.ask) granted = await options.ask(texts);
      else if (game.ui && game.scene) {
        granted = await game.ui.forScene(game.scene).confirm({
          title: texts.title,
          message: texts.message,
          confirm: texts.allow,
          cancel: texts.deny,
        });
      } else if (game.mount && typeof document !== 'undefined') {
        granted = await consentDialog(game.mount, texts);
      } else {
        throw new Error(
          'telemetry.askConsent() has no screen to ask on: pass { ask } to show yours.',
        );
      }
      await api.setConsent(granted);
      return granted;
    },
    /**
     * Reports an error (with its scrubbed stack trace). Returns the event id, or `undefined` when
     * nothing was sent (no consent, no DSN, sampled out).
     */
    captureException(error: unknown, extra?: Extra): Promise<string | undefined> {
      return send({
        level: 'error',
        logger: 'telemetry',
        exception: exceptionOf(error),
        ...(extra ? { extra } : {}),
      });
    },
    /** Reports a message. */
    captureMessage(message: string, level: Level = 'info'): Promise<string | undefined> {
      return send({ level, logger: 'telemetry', message });
    },
    /** Records a usage event (`level-complete`, `settings-opened`…) when `events` is on. */
    track(name: string, data?: Extra): Promise<string | undefined> {
      if (!config.events) return Promise.resolve(undefined);
      return send({
        level: 'info',
        logger: 'telemetry.event',
        message: name,
        ...(data ? { extra: data } : {}),
      });
    },
    /** Adds a step to the trail attached to the next events (kept in memory only). */
    breadcrumb(message: string, data?: Extra): void {
      if (!active() || config.maxBreadcrumbs === 0) return;
      breadcrumbs.push({
        timestamp: Date.now() / 1000,
        message,
        category: 'game',
        ...(data ? { data } : {}),
      });
      if (breadcrumbs.length > config.maxBreadcrumbs) breadcrumbs.shift();
    },
    /** Sends the stored events now. */
    flush(): Promise<void> {
      return queue.flush();
    },
  };

  const cleanup: (() => void)[] = [];
  const off = game.events?.on('scene', ({ name }) => api.breadcrumb(`scene ${name}`));
  if (off) cleanup.push(off);
  if (config.crashes && typeof globalThis.addEventListener === 'function') {
    const onError = (event: ErrorEvent) => void api.captureException(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => void api.captureException(event.reason);
    globalThis.addEventListener('error', onError);
    globalThis.addEventListener('unhandledrejection', onRejection);
    cleanup.push(() => {
      globalThis.removeEventListener('error', onError);
      globalThis.removeEventListener('unhandledrejection', onRejection);
    });
  }

  return {
    api,
    async restore() {
      const stored = await storage.get<Consent>('consent');
      if (stored === 'granted' || stored === 'denied') consent = stored;
    },
    dispose() {
      for (const remove of cleanup) remove();
    },
  };
}

/** API of the `telemetry` module: `game.modules.telemetry`. */
export type Telemetry = ReturnType<typeof createTelemetry>['api'];

/**
 * Opt-in crash reports and usage events (SVC-04), sent with the Sentry envelope protocol to
 * Sentry or a self-hosted backend (GlitchTip, Sentry self-hosted). Nothing is recorded before the
 * player agrees; events carry no user, IP, device name or file path from the player's machine,
 * and wait on the device while offline.
 *
 * @example
 * ```ts
 * // game.config.ts
 * modules: { telemetry: { dsn: 'https://abc123@glitchtip.example.com/3' } }
 *
 * // title scene
 * const telemetry = this.game.modules.telemetry;
 * await telemetry.askConsent(); // once; the answer is remembered
 * telemetry.track('title-shown');
 * ```
 */
export const telemetry = defineModule({
  name: 'telemetry',
  version: TELEMETRY_VERSION,
  config,
  async setup(context) {
    const instance = createTelemetry(context);
    await instance.restore();
    context.onDispose(() => instance.dispose());
    return instance.api;
  },
});
