// The Sentry envelope protocol, written by hand: one POST per event, no SDK. Sentry and
// self-hosted backends that speak it (GlitchTip, Sentry self-hosted) accept these envelopes.

/** Version sent as `sentry_client` and `sdk.version`. */
export const TELEMETRY_VERSION = '0.0.0';

/** A parsed DSN. */
export interface Dsn {
  /** The DSN as written in the configuration. */
  readonly dsn: string;
  readonly publicKey: string;
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
  function?: string;
  filename: string;
  lineno: number;
  colno: number;
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

/** Parses a V8 (`at fn (url:1:2)`) or Firefox / Safari (`fn@url:1:2`) stack, oldest frame first. */
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
  event_id: string;
  timestamp: number;
  platform: 'javascript';
  level: Level;
  logger: string;
  release: string;
  environment: string;
  message?: string;
  exception?: { values: { type: string; value: string; stacktrace?: { frames: Frame[] } }[] };
  tags: Record<string, string>;
  contexts: Record<string, Record<string, string>>;
  extra?: Record<string, string | number | boolean>;
  breadcrumbs?: {
    timestamp: number;
    message: string;
    category: string;
    data?: Record<string, string | number | boolean>;
  }[];
  sdk: { name: string; version: string; settings: { infer_ip: 'never' } };
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
