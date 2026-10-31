// OpenID Connect for public clients: authorization code + PKCE (S256), refresh tokens. The ID
// token comes straight from the token endpoint over TLS, so its claims are checked without
// verifying the signature (OpenID Connect Core 3.1.3.7); servers that trust it (the reference
// server) verify the signature themselves.

/** The parts of the discovery document the module uses. */
export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
}

/** Token endpoint answer. */
export interface TokenSet {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

/** Claims of an ID token or userinfo answer. */
export type Claims = Record<string, unknown> & { sub: string };

/**
 * A failed sign-in step: discovery, the provider's answer, token checks or a cancelled login.
 * Its message says what failed; `code` is the OAuth error code when the provider sent one.
 *
 * @example
 * ```ts
 * import { OidcError } from '@blacklight/module-accounts-oidc';
 *
 * try {
 *   await this.game.modules['accounts-oidc'].login();
 * } catch (error) {
 *   if (error instanceof OidcError && error.code === 'access_denied') return; // player cancelled
 *   throw error;
 * }
 * ```
 */
export class OidcError extends Error {
  constructor(
    message: string,
    /** OAuth error code sent by the provider (`access_denied`, `invalid_grant`…), if any. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OidcError';
  }
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A random URL-safe string of `bytes` random bytes. */
export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE S256 challenge of a verifier. */
export async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** Fetches `<issuer>/.well-known/openid-configuration` and checks its issuer. */
export async function discover(issuer: string): Promise<Discovery> {
  const base = issuer.replace(/\/+$/, '');
  const response = await fetch(`${base}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new OidcError(
      `${base}/.well-known/openid-configuration answered HTTP ${response.status}: check \`issuer\` in game.config.ts.`,
    );
  }
  const document = (await response.json()) as Discovery;
  if (document.issuer.replace(/\/+$/, '') !== base) {
    throw new OidcError(
      `The provider says its issuer is "${document.issuer}", not "${issuer}". Use its exact issuer URL.`,
    );
  }
  return document;
}

/** Decodes a JWT payload without verifying it (see the file comment). */
export function decodeJwt(token: string): Claims {
  const part = token.split('.')[1];
  if (!part) throw new OidcError('The ID token is not a JWT.');
  const text = new TextDecoder().decode(
    Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  );
  return JSON.parse(text) as Claims;
}

/** Checks issuer, audience, nonce and expiry of an ID token's claims. */
export function checkIdToken(
  claims: Claims,
  expected: { issuer: string; clientId: string; nonce?: string },
  now = Date.now(),
): void {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const problems: string[] = [];
  if (String(claims.iss).replace(/\/+$/, '') !== expected.issuer.replace(/\/+$/, '')) {
    problems.push(`issuer "${String(claims.iss)}"`);
  }
  if (!audience.includes(expected.clientId)) problems.push('audience');
  if (expected.nonce !== undefined && claims.nonce !== expected.nonce) problems.push('nonce');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now - 60_000) problems.push('expiry');
  if (problems.length > 0) {
    throw new OidcError(`The ID token was refused (wrong ${problems.join(', ')}). Sign in again.`);
  }
}

/** Calls the token endpoint with a form body (public client: no secret). */
export async function tokenRequest(
  endpoint: string,
  form: Record<string, string>,
): Promise<TokenSet> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(form),
  });
  const data = (await response.json().catch(() => ({}))) as TokenSet & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new OidcError(
      `The provider refused the token request: ${data.error_description ?? data.error ?? `HTTP ${response.status}`}.`,
      data.error,
    );
  }
  return data;
}
