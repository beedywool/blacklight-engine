// Generates the API reference (docs/api/) from the type declarations of every published package,
// with TypeDoc and typedoc-plugin-markdown. Run after `pnpm build`: the declarations are read from
// each package's dist/, where comments and `@internal` tags are kept.
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Application, Converter, ReflectionKind } from 'typedoc';

const root = fileURLToPath(new URL('../../', import.meta.url));
const docs = fileURLToPath(new URL('../', import.meta.url));

/** Package name → declaration entry, relative to the repository. */
export const PACKAGES = {
  '@blacklight/core': 'packages/core/dist/index.d.ts',
  '@blacklight/core/debug': 'packages/core/dist/debug.d.ts',
  '@blacklight/ui': 'packages/ui/dist/types/index.d.ts',
  '@blacklight/three': 'packages/three/dist/index.d.ts',
  '@blacklight/three/ui': 'packages/three/dist/ui.d.ts',
  '@blacklight/physics': 'packages/physics/dist/index.d.ts',
  '@blacklight/net': 'packages/net/dist/index.d.ts',
  '@blacklight/net/testing': 'packages/net/dist/testing.d.ts',
  '@blacklight/native': 'packages/native/dist/index.d.ts',
  '@blacklight/native/define-native': 'packages/native/dist/define-native.d.ts',
  '@blacklight/mobile': 'packages/mobile/dist/index.d.ts',
  '@blacklight/cli/vite': 'packages/cli/dist/vite.d.ts',
  '@blacklight/registry': 'packages/registry/dist/index.d.ts',
  '@blacklight/module-http': 'packages/modules/http/dist/index.d.ts',
  '@blacklight/module-sqlite': 'packages/modules/sqlite/dist/index.d.ts',
  '@blacklight/module-cloud-save': 'packages/modules/cloud-save/dist/index.d.ts',
  '@blacklight/module-accounts-oidc': 'packages/modules/accounts-oidc/dist/index.d.ts',
  '@blacklight/module-achievements': 'packages/modules/achievements/dist/index.d.ts',
  '@blacklight/module-telemetry': 'packages/modules/telemetry/dist/index.d.ts',
  'eslint-plugin-blacklight': 'packages/eslint-plugin/dist/index.d.ts',
};

const missing = Object.values(PACKAGES).filter((entry) => !existsSync(root + entry));
if (missing.length) {
  console.error(
    `API reference: missing declarations (${missing.join(', ')}). Run \`pnpm build\` at the repository root first.`,
  );
  process.exit(1);
}

const byEntry = new Map(
  Object.entries(PACKAGES).map(([name, entry]) => [entry.replace(/\.d\.ts$/, ''), name]),
);

rmSync(`${docs}api`, { recursive: true, force: true });
const app = await Application.bootstrapWithPlugins({
  entryPoints: Object.values(PACKAGES).map((entry) => root + entry),
  tsconfig: `${docs}scripts/api.tsconfig.json`,
  plugin: ['typedoc-plugin-markdown', 'typedoc-vitepress-theme'],
  out: `${docs}api`,
  docsRoot: docs,
  name: 'API reference',
  readme: 'none',
  entryFileName: 'index',
  excludePrivate: true,
  excludeProtected: false,
  excludeInternal: true,
  excludeExternals: true,
  disableSources: true,
  skipErrorChecking: true,
  hidePageHeader: true,
  hideBreadcrumbs: true,
  useCodeBlocks: true,
  parametersFormat: 'table',
  interfacePropertiesFormat: 'table',
  classPropertiesFormat: 'table',
  typeDeclarationFormat: 'table',
  enumMembersFormat: 'table',
  sidebar: { autoConfiguration: true, format: 'vitepress', pretty: true, collapsed: true },
  logLevel: 'Warn',
  validation: { notExported: false, invalidLink: false, rewrittenLink: false },
});

// Modules are named after their file path by default (core/dist/index): use the package names.
app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
  for (const module of context.project.getChildrenByKind(ReflectionKind.Module)) {
    const matches = (entry) =>
      [entry, entry.replace(/\/index$/, '')].some(
        (path) => path === module.name || path.endsWith(`/${module.name}`),
      );
    const key = [...byEntry.keys()].find(matches);
    if (key) module.name = byEntry.get(key);
  }
});

const project = await app.convert();
if (!project) {
  console.error('API reference: TypeDoc could not read the declarations.');
  process.exit(1);
}
await app.generateOutputs(project);
console.log(`API reference: ${Object.keys(PACKAGES).length} entry points → docs/api/`);
