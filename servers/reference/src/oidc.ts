// ID token verification. The game is the OpenID Connect client (authorization code + PKCE in the
// player's browser); it hands the ID token to this server, which checks the signature against the
// provider's published keys and the claims before linking the identity to an account. The server
// never sees passwords, refresh tokens or client secrets.
import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto';

/** An identity provider this server trusts. */
export interface ProviderConfig {
  /** Issuer URL, exactly as in the ID tokens' `iss` claim. */
  issuer: string;
  /** Client ids the tokens must be issued to (`aud`): the games' client ids at that provider. */
  audiences: string[];
  /** Where this server reaches the provider when it differs from the issuer (a Docker network name…). */
  internalUrl?: string;
}

/** Claims the server reads from a verified ID token. */
export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  name?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}

/** The token was refused; `message` says why. */
export class TokenError extends Error {}

/** Clock difference tolerated between the provider and this server. */
const LEEWAY_SECONDS = 60;
/** Keys are fetched again at most this often for an unknown `kid` (forged tokens must not flood the provider). */
const REFETCH_INTERVAL_MS = 30_000;
const KEYS_TTL_MS = 60 * 60_000;

interface KeySet {
  keys: (JsonWebKey & { kid?: string; alg?: string; use?: string })[];
  fetched: number;
}

function decodePart(part: string | undefined, what: string): Record<string, unknown> {
  try {
    const value = JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8')) as unknown;
    if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  } catch {
    // reported below
  }
  throw new TokenError(`the ID token ${what} is not valid JSON`);
}

const ALGORITHMS: Record<string, { kty: string; crv?: string }> = {
  RS256: { kty: 'RSA' },
  ES256: { kty: 'EC', crv: 'P-256' },
  EdDSA: { kty: 'OKP', crv: 'Ed25519' },
};

function checkSignature(alg: string, key: KeyObject, data: Buffer, signature: Buffer): boolean {
  if (alg === 'RS256') return verify('sha256', data, key, signature);
  // JWS carries raw r||s ECDSA signatures, not DER.
  if (alg === 'ES256') return verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
  return verify(null, data, key, signature);
}

/** Verifies ID tokens from the configured providers. */
export class IdTokenVerifier {
  private readonly providers: ProviderConfig[];
  private readonly keySets = new Map<string, KeySet>();
  private readonly fetchImpl: typeof fetch;

  constructor(providers: ProviderConfig[], fetchImpl: typeof fetch = fetch) {
    this.providers = providers.map((p) => ({ ...p, issuer: p.issuer.replace(/\/+$/, '') }));
    this.fetchImpl = fetchImpl;
  }

  /**
   * Returns the token's claims when its signature, issuer, audience and dates are valid.
   *
   * @throws {@link TokenError} with the reason otherwise.
   */
  async verify(token: string): Promise<IdTokenClaims> {
    const parts = token.split('.');
    if (parts.length !== 3)
      throw new TokenError('the ID token is not a JWT (three dot-separated parts)');
    const header = decodePart(parts[0], 'header');
    const claims = decodePart(parts[1], 'payload') as Partial<IdTokenClaims>;
    const alg = String(header.alg);
    if (!ALGORITHMS[alg]) {
      throw new TokenError(
        `the ID token algorithm "${alg}" is not supported (RS256, ES256 or EdDSA)`,
      );
    }
    const issuer = String(claims.iss ?? '').replace(/\/+$/, '');
    const provider = this.providers.find((p) => p.issuer === issuer);
    if (!provider) {
      throw new TokenError(
        `the ID token issuer "${claims.iss}" is not configured in OIDC_PROVIDERS`,
      );
    }
    const key = await this.key(
      provider,
      alg,
      typeof header.kid === 'string' ? header.kid : undefined,
    );
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!checkSignature(alg, key, data, Buffer.from(parts[2]!, 'base64url'))) {
      throw new TokenError('the ID token signature is invalid');
    }

    const now = Date.now() / 1000;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((aud) => typeof aud === 'string' && provider.audiences.includes(aud))) {
      throw new TokenError(
        `the ID token was issued to ${JSON.stringify(claims.aud)}, not to one of this server's audiences; add the game's client id to the provider's "audiences"`,
      );
    }
    if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_SECONDS < now) {
      throw new TokenError('the ID token has expired; sign in again');
    }
    if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY_SECONDS > now) {
      throw new TokenError('the ID token is not valid yet (check the server clock)');
    }
    if (typeof claims.sub !== 'string' || claims.sub === '') {
      throw new TokenError('the ID token has no subject (`sub`)');
    }
    return claims as IdTokenClaims;
  }

  private async key(
    provider: ProviderConfig,
    alg: string,
    kid: string | undefined,
  ): Promise<KeyObject> {
    let set = this.keySets.get(provider.issuer);
    if (!set || Date.now() - set.fetched > KEYS_TTL_MS) set = await this.fetchKeys(provider);
    let jwk = this.pick(set, alg, kid);
    if (!jwk && Date.now() - set.fetched > REFETCH_INTERVAL_MS) {
      // The provider may have rotated its keys since the last fetch.
      set = await this.fetchKeys(provider);
      jwk = this.pick(set, alg, kid);
    }
    if (!jwk) throw new TokenError(`no ${alg} key${kid ? ` "${kid}"` : ''} in the provider's JWKS`);
    return createPublicKey({ key: jwk, format: 'jwk' });
  }

  private pick(set: KeySet, alg: string, kid: string | undefined): JsonWebKey | undefined {
    const { kty, crv } = ALGORITHMS[alg]!;
    return set.keys.find(
      (k) =>
        k.kty === kty &&
        (!crv || k.crv === crv) &&
        (k.use === undefined || k.use === 'sig') &&
        (k.alg === undefined || k.alg === alg) &&
        (kid === undefined || k.kid === kid),
    );
  }

  /** Through `internalUrl` when set: same paths, another host. */
  private back(provider: ProviderConfig, url: string): string {
    const internal = provider.internalUrl?.replace(/\/+$/, '');
    return internal && url.startsWith(provider.issuer)
      ? internal + url.slice(provider.issuer.length)
      : url;
  }

  private async fetchKeys(provider: ProviderConfig): Promise<KeySet> {
    const json = async (url: string) => {
      let response: Response;
      try {
        response = await this.fetchImpl(this.back(provider, url));
      } catch (error) {
        throw new TokenError(`cannot reach the identity provider at ${url}: ${String(error)}`);
      }
      if (!response.ok)
        throw new TokenError(`the identity provider answered HTTP ${response.status} for ${url}`);
      return (await response.json()) as Record<string, unknown>;
    };
    const discovery = await json(`${provider.issuer}/.well-known/openid-configuration`);
    if (typeof discovery.jwks_uri !== 'string') {
      throw new TokenError(`the discovery document of ${provider.issuer} has no jwks_uri`);
    }
    const jwks = await json(discovery.jwks_uri);
    const set: KeySet = {
      keys: Array.isArray(jwks.keys) ? (jwks.keys as KeySet['keys']) : [],
      fetched: Date.now(),
    };
    this.keySets.set(provider.issuer, set);
    return set;
  }
}
