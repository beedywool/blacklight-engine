// The Sentry envelope protocol, written by hand: one POST per event, no SDK. Sentry and
// self-hosted backends that speak it (GlitchTip, Sentry self-hosted) accept these envelopes.

/** Version sent as `sentry_client` and `sdk.version`. */
export const TELEMETRY_VERSION = '0.0.0';

/** A parsed DSN. */
export interface Dsn {
  /** The DSN as written in the configuration. */
  readonly dsn: string;
  /** Public key of the project (the user part of the DSN), sent as `sentry_key`. */
  readonly publicKey: string;
  /** Project id (the last path segment of the DSN). */
  readonly projectId: string;
  /** Where envelopes go, with the authentication in the query string. */
  readonly envelopeUrl: string;
}

/**
 * Parses a Sentry DSN (`https://<public key>@<host>[:port]/[path/]<project id>`), as found in the
 * project settings of Sentry or GlitchTip.
 *
 * @example
 * ```ts
 * parseDsn('https://abc123@o1.ingest.sentry.io/42').envelopeUrl;
 * // https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc123&sentry_version=7&…
 * ```
 * @throws Error saying which part is missing.
 */
export function parseDsn(dsn: string): Dsn {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error(
      `"${dsn}" is not a valid DSN. Copy it from your Sentry or GlitchTip project settings: https://<public key>@<host>/<project id>.`,
    );
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const projectId = parts.pop();
  if (!/^https?:$/.test(url.protocol) || !url.username || !projectId) {
    throw new Error(
      `"${dsn}" is not a valid DSN: it needs http(s), a public key before "@" and a project id at the end (https://<public key>@<host>/<project id>).`,
    );
  }
  const path = parts.length > 0 ? `/${parts.join('/')}` : '';
  const query = new URLSearchParams({
    sentry_key: decodeURIComponent(url.username),
    sentry_version: '7',
    sentry_client: `blacklight-telemetry/${TELEMETRY_VERSION}`,
  });
  return {
    dsn,
    publicKey: decodeURIComponent(url.username),
    projectId,
    // Authentication in the query string keeps the request "simple": no CORS preflight.
    envelopeUrl: `${url.protocol}//${url.host}${path}/api/${projectId}/envelope/?${query}`,
  };
}

/** One frame of a stack trace, Sentry style. */
export interface Frame {
  /** Function name, when the stack line has one. */
  function?: string;
  /** Script location scrubbed by {@link scrubFilename}: `app:///<path inside the game>`. */
  filename: string;
  /** 1-based line number. */
  lineno: number;
  /** 1-based column number. */
  colno: number;
  /** `false` for dependencies (`node_modules`, Vite's prebundled deps), so backends group by game code. */
  in_app: boolean;
}

/**
 * Removes what could identify the player from a script location: query strings and fragments,
 * and the install folder (which holds the user name on desktop). What remains is the path
 * inside the game, as `app:///<path>`.
 *
 * @example
 * ```ts
 * scrubFilename('file:///home/alice/Game/resources/app.asar/assets/game.js'); // app:///assets/game.js
 * ```
 */
export function scrubFilename(location: string): string {
  const bare = location.replace(/[?#].*$/, '');
  const asar = bare.indexOf('/app.asar/');
  if (asar >= 0) return `app:///${bare.slice(asar + '/app.asar/'.length)}`;
  const assets = bare.indexOf('/assets/');
  if (assets >= 0) return `app:///${bare.slice(assets + 1)}`;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\/[^/]*(.*)$/i.exec(bare);
  if (scheme && !/^file$/i.test(scheme[1]!)) return `app:///${scheme[2]!.replace(/^\/+/, '')}`;
  // A file path outside the app folder: only its name says nothing about the person.
  const name = bare.split(/[\\/]/).pop() ?? bare;
  return `app:///${name}`;
}

const V8_FRAME = /^\s*at (?:(?:async )?(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/**
 * Parses a V8 (`at fn (url:1:2)`) or Firefox / Safari (`fn@url:1:2`) stack into Sentry frames,
 * oldest frame first (the frame that threw comes last), with locations scrubbed by
 * {@link scrubFilename}. Lines that are not frames are skipped.
 *
 * @example
 * ```ts
 * import { parseStack } from '@blacklight/module-telemetry';
 *
 * const frames = parseStack(new Error('boom').stack);
 * frames.at(-1); // { function: 'Title.update', filename: 'app:///assets/index.js', lineno: 1, colno: 4321, in_app: true }
 * ```
 */
export function parseStack(stack: string | undefined): Frame[] {
  const frames: Frame[] = [];
  for (const line of (stack ?? '').split('\n')) {
    const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!match) continue;
    const [, fn, file, lineno, colno] = match;
    frames.push({
      ...(fn ? { function: fn } : {}),
      filename: scrubFilename(file!),
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !/node_modules|\/@vite\/|\/deps\//.test(file!),
    });
  }
  // Sentry wants the frame that threw last.
  return frames.reverse();
}

/** A random 32-character hex id. */
export function eventId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** A Sentry event as this module builds it (no `user`, no `request`). */
export interface SentryEvent {
  /** Random 32-character hex id, returned by `captureException` and friends. */
  event_id: string;
  /** Time of the event in seconds since the epoch. */
  timestamp: number;
  /** Always `'javascript'`. */
  platform: 'javascript';
  /** Severity: `error` for exceptions, the given level for messages. */
  level: Level;
  /** `telemetry`, or `telemetry.event` for `track()`. */
  logger: string;
  /** Release name, `<game id>@<game version>` unless configured. */
  release: string;
  /** `production` or `development` unless configured. */
  environment: string;
  /** The message, or the event name of `track()`. */
  message?: string;
  /** The reported error, for `captureException` and uncaught errors. */
  exception?: {
    /** One entry per error (the module sends one). */
    values: {
      /** Error class name, e.g. `TypeError`. */
      type: string;
      /** Error message. */
      value: string;
      /** Scrubbed stack trace, when the error has one. */
      stacktrace?: {
        /** Frames from {@link parseStack}, oldest first. */
        frames: Frame[];
      };
    }[];
  };
  /** `platform` (`web`, `desktop`, `android`, `ios`) and `steam` in Steam builds. */
  tags: Record<string, string>;
  /** Game id and version, and the runtime (`browser`, `electron`, `webview`). */
  contexts: Record<string, Record<string, string>>;
  /** Values passed with the event. */
  extra?: Record<string, string | number | boolean>;
  /** The last scene changes and `breadcrumb()` calls, oldest first. */
  breadcrumbs?: {
    /** Time in seconds since the epoch. */
    timestamp: number;
    /** What happened, e.g. `scene level-1` for a scene change. */
    message: string;
    /** `game` for the breadcrumbs this module records. */
    category: string;
    /** Values passed with the breadcrumb. */
    data?: Record<string, string | number | boolean>;
  }[];
  /** Identifies the sender to the backend. */
  sdk: {
    /** `blacklight.telemetry`. */
    name: string;
    /** {@link TELEMETRY_VERSION}. */
    version: string;
    /** Settings the backend applies to the event. */
    settings: {
      /** Tells the backend never to derive the player's IP address from the request. */
      infer_ip: 'never';
    };
  };
}

/** Sentry severity levels. */
export type Level = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

/** Turns any thrown value into a Sentry exception. */
export function exceptionOf(error: unknown): NonNullable<SentryEvent['exception']> {
  if (error instanceof Error) {
    const frames = parseStack(error.stack);
    return {
      values: [
        {
          type: error.name || 'Error',
          value: error.message,
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        },
      ],
    };
  }
  return {
    values: [
      {
        type: 'Error',
        value: typeof error === 'string' ? error : (JSON.stringify(error) ?? String(error)),
      },
    ],
  };
}

/** The three lines of an envelope holding one event. */
export function envelope(dsn: Dsn, event: SentryEvent): string {
  const payload = JSON.stringify(event);
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: dsn.dsn }),
    JSON.stringify({ type: 'event', length: new TextEncoder().encode(payload).length }),
    payload,
  ].join('\n');
}
