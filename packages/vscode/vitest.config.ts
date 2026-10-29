import { defineProject } from 'vitest/config';

// Unit tests of the parts that do not need VS Code; the integration tests run inside VS Code
// (`pnpm --filter blacklight-vscode test:integration`).
export default defineProject({
  test: { name: 'vscode', include: ['test/unit/**/*.spec.ts'], environment: 'node' },
});
