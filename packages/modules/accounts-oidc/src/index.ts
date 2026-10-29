import {
  EventBus,
  defineModule,
  t,
  type Infer,
  type ModuleContext,
  type Unsubscribe,
} from '@blacklight/core';
import type { Http } from '@blacklight/module-http';
import {
  OidcError,
  challenge,
  checkIdToken,
  decodeJwt,
  discover,
  randomToken,
  tokenRequest,
  type Claims,
  type Discovery,
  type TokenSet,
} from './oidc';
import { secureStore } from './secure';

export { OidcError } from './oidc';

/** Issuer of BlackLight SSO, used by `preset: 'blacklight'` unless `issuer` is set. */
export const BLACKLIGHT_SSO_ISSUER = 'https://sso.beedywool.com';

const config = t.object({
  /** `'blacklight'`: BlackLight SSO issuer, scopes and consent prompt. */
  preset: t.enum(['blacklight']).optional(),
  /** Issuer URL of the OpenID Connect provider (required without a preset). */
  issuer: t.string({ url: true }).optional(),
  /** Client id registered with the provider (a public client: PKCE, no secret). */
  clientId: t.string({ min: 1 }),
  /** Scopes asked for. `offline_access` gives a refresh token, so the player stays signed in. */
  scopes: t.array(t.string({ min: 1 })).optional(),
  /**
   * Where the provider sends the player back. Defaults: the game page on the web, `<game id>:/oauth/callback`
   * on desktop and mobile (a custom scheme the app registers).
   */
  redirectUri: t.string({ min: 1 }).optional(),
  /** `prompt` parameter (`login`, `consent`…). */
  prompt: t.string().optional(),
  /** Reference server to link the account with (`servers/reference`); its requests get the session. */
  server: t.string({ url: true }).optional(),
  /** How long `login()` waits for the browser to come back on desktop and mobile (ms). */
  timeout: t.number({ min: 1000 }).default(600_000),
});

/** Options of the `accounts-oidc` module in `game.config.ts`. */
export type AccountsConfig = Infer<typeof config>;

/** The signed-in player, from the ID token and the userinfo endpoint. */
export interface AccountUser {
  /** Stable identifier at the provider. */
  sub: string;
  issuer: string;
  name?: string;
  username?: string;
  /** Only when the `email` scope was asked for. */
  email?: string;
  picture?: string;
}

/** The account on the reference server. */
export interface ServerAccount {
  id: string;
  name: string;
  identities: { issuer: string; subject: string }[];
}

/** Events of the accounts module. */
export interface AccountEvents {
  /** A player signed in (or was restored at startup). */
  login: AccountUser;
  logout: void;
  /** The provider refused the stored refresh token: the player must sign in again. */
  expired: void;
  /** A login started with a redirect failed or was cancelled. */
  error: OidcError;
  /** The reference server account changed (login, link, guest). */
  server: ServerAccount;
}

interface Pending {
  state: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
  created: number;
}

const PENDING_KEY = 'blacklight:oidc:pending';
const PENDING_TTL = 10 * 60_000;

function settings(config: AccountsConfig, gameId: string, web: boolean) {
  const blacklight = config.preset === 'blacklight';
  const issuer = config.issuer ?? (blacklight ? BLACKLIGHT_SSO_ISSUER : undefined);
  if (!issuer) {
    throw new Error(
      'accounts-oidc needs `issuer` (the provider URL) or `preset: "blacklight"` in game.config.ts.',
    );
  }
  const scopes = config.scopes ?? ['openid', 'profile', 'offline_access'];
  if (!scopes.includes('openid')) scopes.unshift('openid');
  const redirectUri =
    config.redirectUri ??
    (web ? `${location.origin}${location.pathname}` : `${gameId}:/oauth/callback`);
  // oidc-provider (BlackLight SSO) only grants offline_access after an explicit consent prompt.
  const prompt =
    config.prompt ?? (blacklight && scopes.includes('offline_access') ? 'consent' : undefined);
  return { issuer, scopes, redirectUri, prompt };
}

function toUser(claims: Claims, issuer: string): AccountUser {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  return {
    sub: claims.sub,
    issuer,
    name: text(claims.name) ?? text(claims.preferred_username),
    username: text(claims.preferred_username),
    email: text(claims.email),
    picture: /^https?:\/\//.test(String(claims.picture ?? '')) ? String(claims.picture) : undefined,
  };
}

function createAccounts(context: ModuleContext<AccountsConfig>) {
  const { platform, config, storage, log } = context;
  const web = platform.name === 'web';
  const { issuer, scopes, redirectUri, prompt } = settings(config, context.game.config.id, web);
  const secrets = secureStore(platform, `${context.game.config.id}.accounts`);
  const events = new EventBus<AccountEvents>();
  const http = context.modules.http as Http | undefined;
  let discovery: Promise<Discovery> | undefined;
  let user: AccountUser | undefined;
  let access: { token: string; expires: number } | undefined;
  let refreshing: Promise<string | undefined> | undefined;
  let server: { token: string; expiresAt: number; account: ServerAccount } | undefined;

  const meta = () => {
    discovery ??= discover(issuer).catch((error: unknown) => {
      discovery = undefined; // retried on the next call
      throw error;
    });
    return discovery;
  };

  const linkServer = async (idToken?: string, guest = false): Promise<void> => {
    if (!config.server) return;
    const base = config.server.replace(/\/+$/, '');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (server && server.expiresAt > Date.now()) headers.authorization = `Bearer ${server.token}`;
    const response = await fetch(`${base}/v1/auth/${guest ? 'guest' : 'oidc'}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(guest ? {} : { idToken }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      token?: string;
      expiresAt?: number;
      account?: ServerAccount;
      message?: string;
    };
    if (!response.ok || !data.token || !data.account) {
      throw new OidcError(
        `The game server refused the account: ${data.message ?? `HTTP ${response.status}`}.`,
      );
    }
    server = { token: data.token, expiresAt: data.expiresAt ?? 0, account: data.account };
    await secrets.set('server', JSON.stringify(server));
    events.emit('server', data.account);
  };

  const accept = async (tokens: TokenSet, nonce?: string): Promise<void> => {
    const document = await meta();
    let claims: Claims | undefined;
    if (tokens.id_token) {
      claims = decodeJwt(tokens.id_token);
      checkIdToken(claims, { issuer: document.issuer, clientId: config.clientId, nonce });
    }
    access = {
      token: tokens.access_token,
      expires: Date.now() + (tokens.expires_in ?? 300) * 1000,
    };
    if (tokens.refresh_token) await secrets.set('refresh', tokens.refresh_token);
    if (document.userinfo_endpoint) {
      try {
        const response = await fetch(document.userinfo_endpoint, {
          headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        if (response.ok) {
          const info = (await response.json()) as Claims;
          if (!claims || info.sub === claims.sub) claims = { ...claims, ...info };
        }
      } catch {
        // The ID token claims are enough to sign in.
      }
    }
    if (!claims) throw new OidcError('The provider sent no ID token: include the "openid" scope.');
    user = toUser(claims, document.issuer);
    await storage.set('user', user);
    if (config.server && tokens.id_token) {
      try {
        await linkServer(tokens.id_token);
      } catch (error) {
        log.warn('could not link the account with the game server:', error);
      }
    }
    events.emit('login', user);
  };

  const exchange = async (code: string, pending: Pending): Promise<AccountUser> => {
    const document = await meta();
    const tokens = await tokenRequest(document.token_endpoint, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: config.clientId,
      code_verifier: pending.verifier,
    });
    await accept(tokens, pending.nonce);
    return user!;
  };

  /** Checks the provider's answer in a redirect URL and finishes the login. */
  const complete = async (url: URL, pending: Pending): Promise<AccountUser> => {
    const params = url.searchParams;
    if (params.get('state') !== pending.state) {
      throw new OidcError(
        'The login answer does not match the login in progress (state). Try again.',
      );
    }
    const error = params.get('error');
    if (error) {
      throw new OidcError(
        error === 'access_denied'
          ? 'The login was cancelled.'
          : `The provider refused the login: ${params.get('error_description') ?? error}.`,
        error,
      );
    }
    const returnedIssuer = params.get('iss');
    if (
      returnedIssuer &&
      returnedIssuer.replace(/\/+$/, '') !== (await meta()).issuer.replace(/\/+$/, '')
    ) {
      throw new OidcError('The login answer comes from another provider (iss). Try again.');
    }
    const code = params.get('code');
    if (!code) throw new OidcError('The provider sent no authorization code.');
    return exchange(code, pending);
  };

  const authorizeUrl = async (pending: Pending): Promise<string> => {
    const document = await meta();
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: pending.redirectUri,
      scope: scopes.join(' '),
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await challenge(pending.verifier),
      code_challenge_method: 'S256',
    });
    if (prompt) query.set('prompt', prompt);
    return `${document.authorization_endpoint}?${query}`;
  };

  /** Desktop and mobile: the system browser comes back through the app's custom scheme. */
  const waitForDeepLink = (pending: Pending): Promise<URL> =>
    new Promise((resolve, reject) => {
      let off: Unsubscribe = () => {};
      const timer = setTimeout(() => {
        off();
        reject(new OidcError('The login took too long: no answer came back from the browser.'));
      }, config.timeout);
      off = platform.on('deeplink', (payload) => {
        const raw = typeof payload === 'string' ? payload : (payload as { url?: string })?.url;
        if (!raw || !raw.startsWith(pending.redirectUri)) return;
        const url = new URL(raw);
        if (url.searchParams.get('state') !== pending.state) return;
        clearTimeout(timer);
        off();
        resolve(url);
      });
    });

  const refresh = async (): Promise<string | undefined> => {
    const token = await secrets.get('refresh');
    if (!token) return undefined;
    const document = await meta();
    try {
      const tokens = await tokenRequest(document.token_endpoint, {
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: config.clientId,
      });
      await accept(tokens);
      return access?.token;
    } catch (error) {
      if (error instanceof OidcError && error.code === 'invalid_grant') {
        await clear();
        events.emit('expired');
        return undefined;
      }
      throw error;
    }
  };

  const clear = async () => {
    user = undefined;
    access = undefined;
    server = undefined;
    await secrets.remove('refresh');
    await secrets.remove('server');
    await storage.remove('user');
  };

  /** The web redirect came back to the game page: finish that login. */
  const resumeRedirect = async (): Promise<void> => {
    if (!web || typeof location === 'undefined') return;
    const url = new URL(location.href);
    if (!url.searchParams.has('state')) return;
    let pending: Pending | undefined;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as Pending | undefined;
    } catch {
      pending = undefined;
    }
    if (!pending || pending.state !== url.searchParams.get('state')) return;
    sessionStorage.removeItem(PENDING_KEY);
    const answer = new URL(url);
    // The code works once: keep it out of the address bar, history and bookmarks.
    for (const key of ['code', 'state', 'iss', 'error', 'error_description', 'session_state']) {
      url.searchParams.delete(key);
    }
    history.replaceState(history.state, '', url.toString());
    if (Date.now() - pending.created > PENDING_TTL) {
      events.emit('error', new OidcError('The login expired. Try again.'));
      return;
    }
    try {
      await complete(answer, pending);
    } catch (error) {
      events.emit('error', error instanceof OidcError ? error : new OidcError(String(error)));
    }
  };

  return {
    events,
    resumeRedirect,
    complete,
    restore: async () => {
      user = await storage.get<AccountUser>('user');
      const stored = await secrets.get('server');
      if (stored) {
        try {
          server = JSON.parse(stored) as typeof server;
        } catch {
          server = undefined;
        }
      }
      if (config.server && http) {
        http.authorize(config.server.replace(/\/+$/, ''), () =>
          server && server.expiresAt > Date.now() ? `Bearer ${server.token}` : undefined,
        );
      }
    },
    api: {
      /** The signed-in player, `undefined` when signed out. */
      get user(): AccountUser | undefined {
        return user;
      },
      get loggedIn(): boolean {
        return user !== undefined;
      },
      /** The reference server account (with `server` set), `undefined` before linking. */
      get serverAccount(): ServerAccount | undefined {
        return server?.account;
      },
      /**
       * Signs the player in through the provider's page in the system browser. On the web the
       * page leaves for the provider and the login finishes when the game reloads (listen to
       * `login`); on desktop and mobile the promise resolves with the player.
       *
       * @throws {@link OidcError} when the provider refuses, the player cancels or nothing comes back.
       */
      async login(): Promise<AccountUser> {
        const pending: Pending = {
          state: randomToken(),
          verifier: randomToken(48),
          nonce: randomToken(16),
          redirectUri,
          created: Date.now(),
        };
        const url = await authorizeUrl(pending);
        if (web) {
          sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
          location.assign(url);
          // The page is leaving; the login finishes after the redirect back.
          return new Promise<AccountUser>(() => {});
        }
        const answer = waitForDeepLink(pending);
        await platform.openUrl(url);
        return complete(await answer, pending);
      },
      /** Signs out on this device (the provider session stays; see `logoutUrl`). */
      async logout(): Promise<void> {
        await clear();
        events.emit('logout');
      },
      /** The provider's end-session page, to sign out there too (open it with `platform.openUrl`). */
      async logoutUrl(returnTo?: string): Promise<string | undefined> {
        const document = await meta();
        if (!document.end_session_endpoint) return undefined;
        const query = new URLSearchParams({ client_id: config.clientId });
        if (returnTo) query.set('post_logout_redirect_uri', returnTo);
        return `${document.end_session_endpoint}?${query}`;
      },
      /**
       * A valid access token for the provider's APIs, refreshed when it expired. `undefined` when
       * signed out or when the session can no longer be refreshed.
       */
      async accessToken(): Promise<string | undefined> {
        if (access && access.expires - 30_000 > Date.now()) return access.token;
        refreshing ??= refresh().finally(() => (refreshing = undefined));
        return refreshing;
      },
      /**
       * Creates a guest account on the reference server (no sign-in); a later `login()` links the
       * provider identity to it, keeping its saves and achievements.
       */
      async playAsGuest(): Promise<ServerAccount> {
        if (!config.server) {
          throw new Error(
            'playAsGuest() needs `server` (the reference server URL) in the accounts-oidc options.',
          );
        }
        await linkServer(undefined, true);
        return server!.account;
      },
      /** Session token of the reference server, refreshed through the provider when it expired. */
      async serverToken(): Promise<string | undefined> {
        if (server && server.expiresAt - 60_000 > Date.now()) return server.token;
        if (!(await secrets.get('refresh'))) return undefined;
        await refresh();
        return server && server.expiresAt > Date.now() ? server.token : undefined;
      },
      /** Listens to `login`, `logout`, `expired`, `error` and `server`. */
      on<E extends keyof AccountEvents>(
        event: E,
        listener: (payload: AccountEvents[E]) => void,
      ): Unsubscribe {
        return events.on(event, listener);
      },
    },
  };
}

/** API of the `accounts-oidc` module: `game.modules['accounts-oidc']`. */
export type Accounts = ReturnType<typeof createAccounts>['api'];

/**
 * Player accounts over OpenID Connect (SVC-01): authorization code with PKCE in the system
 * browser, back through a redirect (web) or the app's custom scheme (desktop, mobile); the refresh
 * token is kept in the OS keystore (encrypted with the per-install key on the web). With
 * `server`, the account is linked to the reference server, whose requests (`http`) then carry
 * the session.
 *
 * @example
 * ```ts
 * // game.config.ts
 * modules: {
 *   http: {},
 *   'accounts-oidc': { preset: 'blacklight', clientId: 'my-game' },
 * }
 *
 * // title scene
 * const accounts = this.game.modules['accounts-oidc'];
 * accounts.on('login', (user) => this.ui.open(Welcome, { name: user.name }));
 * if (!accounts.loggedIn) await accounts.login();
 * ```
 */
export const accountsOidc = defineModule({
  name: 'accounts-oidc',
  version: '0.0.0',
  config,
  dependencies: ['http'],
  async setup(context) {
    const accounts = createAccounts(context);
    await accounts.restore();
    await accounts.resumeRedirect();
    return accounts.api;
  },
});
