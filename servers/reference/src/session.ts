// Session tokens: `<payload>.<signature>`, both base64url, the payload `{ a: accountId, exp }`
// signed with HMAC-SHA256. Stateless, so a restart keeps players signed in; the account is still
// looked up on every request, so deleting it ends its sessions.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Sessions last 30 days; the game signs in again (silently, with its refresh token) afterwards. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;

export interface Session {
  accountId: string;
  /** Expiry, ms since the epoch. */
  expiresAt: number;
}

/** Creates and checks session tokens with one secret. */
export class Sessions {
  private readonly secret: string;

  constructor(secret: string) {
    if (secret.length < 32) {
      throw new Error(
        'The session secret must be at least 32 characters. Generate one with `openssl rand -base64 48` and set SESSION_SECRET.',
      );
    }
    this.secret = secret;
  }

  private sign(payload: string): Buffer {
    return createHmac('sha256', this.secret).update(payload).digest();
  }

  /** A new token for `accountId`. */
  issue(accountId: string, now = Date.now()): { token: string; expiresAt: number } {
    const expiresAt = now + SESSION_LIFETIME_MS;
    const payload = Buffer.from(JSON.stringify({ a: accountId, exp: expiresAt })).toString(
      'base64url',
    );
    return { token: `${payload}.${this.sign(payload).toString('base64url')}`, expiresAt };
  }

  /** The session in `token`, or `undefined` when it is forged, malformed or expired. */
  check(token: string, now = Date.now()): Session | undefined {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return undefined;
    const expected = this.sign(payload);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        a?: unknown;
        exp?: unknown;
      };
      if (typeof data.a !== 'string' || typeof data.exp !== 'number' || data.exp <= now)
        return undefined;
      return { accountId: data.a, expiresAt: data.exp };
    } catch {
      return undefined;
    }
  }
}
