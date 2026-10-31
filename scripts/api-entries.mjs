// The public API of Blacklight Engine (NF-06): every `exports` entry with types of every published
// package, mapped to the declaration file tsup writes into its dist/. `scripts/api-check.mjs` checks
// these declarations and `docs/scripts/api.mjs` turns them into the API reference, so a new entry in
// a package.json goes here too (scripts/api-check.test.mjs fails otherwise).

/** Import specifier → declaration entry, relative to the repository. */
export const ENTRY_POINTS = {
  '@blacklight/core': 'packages/core/dist/index.d.ts',
  '@blacklight/core/config': 'packages/core/dist/config.d.ts',
  '@blacklight/core/debug': 'packages/core/dist/debug.d.ts',
  '@blacklight/core/schema': 'packages/core/dist/schema.d.ts',
  '@blacklight/ui': 'packages/ui/dist/types/index.d.ts',
  '@blacklight/ui/inspector': 'packages/ui/dist/types/inspector.d.ts',
  '@blacklight/three': 'packages/three/dist/index.d.ts',
  '@blacklight/three/ui': 'packages/three/dist/ui.d.ts',
  '@blacklight/physics': 'packages/physics/dist/index.d.ts',
  '@blacklight/net': 'packages/net/dist/index.d.ts',
  '@blacklight/net/protocol': 'packages/net/dist/protocol.d.ts',
  '@blacklight/net/testing': 'packages/net/dist/testing.d.ts',
  '@blacklight/native': 'packages/native/dist/index.d.ts',
  '@blacklight/native/define-native': 'packages/native/dist/define-native.d.ts',
  '@blacklight/native/main': 'packages/native/dist/main/index.d.cts',
  '@blacklight/native/build': 'packages/native/dist/build/index.d.ts',
  '@blacklight/mobile': 'packages/mobile/dist/index.d.ts',
  '@blacklight/cli/vite': 'packages/cli/dist/vite.d.ts',
  'create-blacklight': 'packages/create/dist/scaffold.d.ts',
  '@blacklight/registry': 'packages/registry/dist/index.d.ts',
  '@blacklight/module-http': 'packages/modules/http/dist/index.d.ts',
  '@blacklight/module-sqlite': 'packages/modules/sqlite/dist/index.d.ts',
  '@blacklight/module-sqlite/native': 'packages/modules/sqlite/dist/native.d.ts',
  '@blacklight/module-cloud-save': 'packages/modules/cloud-save/dist/index.d.ts',
  '@blacklight/module-accounts-oidc': 'packages/modules/accounts-oidc/dist/index.d.ts',
  '@blacklight/module-accounts-oidc/testing': 'packages/modules/accounts-oidc/dist/testing.d.ts',
  '@blacklight/module-achievements': 'packages/modules/achievements/dist/index.d.ts',
  '@blacklight/module-telemetry': 'packages/modules/telemetry/dist/index.d.ts',
  'eslint-plugin-blacklight': 'packages/eslint-plugin/dist/index.d.ts',
};

/** The npm package of an import specifier: `@blacklight/core/debug` → `@blacklight/core`. */
export function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Finds the import specifier of a TypeDoc module. TypeDoc names modules after their path relative to
 * the common folder of the entry points (`core/dist`, `native/dist/main`), extension and `/index`
 * removed.
 */
export function specifierOfModule(moduleName, entries = ENTRY_POINTS) {
  const matches = ([, entry]) => {
    const base = entry.replace(/\.d\.c?ts$/, '');
    return [base, base.replace(/\/index$/, '')].some(
      (path) => path === moduleName || path.endsWith(`/${moduleName}`),
    );
  };
  return Object.entries(entries).find(matches)?.[0];
}
