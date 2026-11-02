// The accounts module, when game.config.ts configures one: sign-in is optional, and without an
// issuer the module is not loaded at all (guests and local profiles still play).
import type { Game } from '@blacklight/core';
import type { Accounts } from '@blacklight/module-accounts-oidc';

/** The `accounts-oidc` API, `undefined` when game.config.ts sets no issuer. */
export function accountsOf(game: Game): Accounts | undefined {
  return (game.modules as Record<string, unknown>)['accounts-oidc'] as Accounts | undefined;
}
