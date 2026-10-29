import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  // The mock OpenID Connect provider is read from its sources: tests run without building packages.
  resolve: {
    alias: {
      '@blacklight/module-accounts-oidc/testing': fileURLToPath(
        new URL('../../packages/modules/accounts-oidc/src/testing.ts', import.meta.url),
      ),
    },
  },
  test: { name: 'reference-server', include: ['test/**/*.spec.ts'], environment: 'node' },
});
