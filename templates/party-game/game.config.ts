import { defineConfig } from '@blacklight/core';

// Issuer URL of the OpenID Connect provider players sign in with, e.g. 'https://sso.example.com'
// (any provider, or a BlackLight SSO you host: see the Accounts guide). Empty: no sign-in on the
// title screen, and players play as guests or local profiles. It is a public URL, not a secret.
const accountsIssuer: string = '';

export default defineConfig({
  name: 'Party Night',
  id: 'com.example.partynight',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'letterbox' },
  // Several people share one screen, and online matches must keep running in the background.
  pauseOnBlur: false,
  input: {
    actions: {
      // The power card of the mini-games (a shield for 3 s), once per mini-game.
      card: ['KeyC', 'Pad:Y'],
    },
  },
  ui: { theme: 'persona' },
  modules: {
    http: {},
    // Optional account shown on the player cards. Register `party-night` as a public client of
    // the provider with this page as redirect URI. `preset: 'blacklight'` asks for the consent a
    // BlackLight SSO needs to give a refresh token; drop it for other providers.
    ...(accountsIssuer
      ? {
          'accounts-oidc': {
            preset: 'blacklight' as const,
            issuer: accountsIssuer,
            clientId: 'party-night',
          },
        }
      : {}),
  },
  security: {
    // Online play talks to the relay the players type in. Release builds add the accounts
    // issuer to this list themselves.
    csp: { connect: ['ws:', 'wss:'] },
  },
  // Used only by `blacklight build --target steam`. 480 is Spacewar, Valve's test app: put your
  // own App ID here before uploading.
  steam: { appId: 480 },
});
