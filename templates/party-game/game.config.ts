import { defineConfig } from '@blacklight/core';

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
    // Optional BlackLight account shown on the player cards; guests play offline. Register
    // `party-night` as a public client of BlackLight SSO with this page as redirect URI.
    'accounts-oidc': { preset: 'blacklight', clientId: 'party-night' },
  },
  security: {
    // Online play talks to the relay the players type in, and the account module to the SSO.
    csp: { connect: ['https://sso.beedywool.com', 'ws:', 'wss:'] },
  },
});
