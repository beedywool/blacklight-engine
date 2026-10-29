// HTTP helpers: JSON bodies with a size limit, JSON replies, errors with a code and a readable
// message, CORS and a per-IP rate limit.
import type { IncomingMessage, ServerResponse } from 'node:http';

/** An error the client sees as `{ error, message }` with `status`. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Sends `data` as JSON (no body for 204). */
export function sendJson(res: ServerResponse, status: number, data?: unknown): void {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store');
  if (status === 204 || data === undefined) {
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

/** Reads a JSON object body; anything else is a 400, more than `limit` bytes a 413. */
export async function readJson(
  req: IncomingMessage,
  limit: number,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) {
      throw new HttpError(
        413,
        'too_large',
        `The request body is larger than ${limit} bytes. Send less data or raise MAX_BODY_BYTES on the server.`,
      );
    }
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_body', 'The request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

/**
 * Sets the CORS headers. Games call the server from any web origin, an Electron custom protocol or
 * a Capacitor WebView; authentication is a bearer token, never a cookie, so `*` is safe by default.
 */
export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  origins: string[] | '*',
): void {
  if (origins === '*') {
    res.setHeader('access-control-allow-origin', '*');
  } else {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('access-control-max-age', '600');
}

/** Fixed-window request counter per client address. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** `true` when `key` may make one more request now. */
  allow(key: string, now = Date.now()): boolean {
    let window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      // Old windows are dropped as they are met, so the map stays as large as the active clients.
      if (this.windows.size > 10_000) this.prune(now);
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count++;
    return window.count <= this.limit;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
