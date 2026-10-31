// Generates the API reference (docs/api/) from the type declarations of every public entry point
// (scripts/api-entries.mjs, shared with `pnpm api:check`), with TypeDoc and typedoc-plugin-markdown.
// Run after `pnpm build`: the declarations are read from each package's dist/, where comments and
// `@internal` tags are kept.
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Application, Converter, ReflectionKind } from 'typedoc';
import { ENTRY_POINTS, specifierOfModule } from '../../scripts/api-entries.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const docs = fileURLToPath(new URL('../', import.meta.url));

const missing = Object.values(ENTRY_POINTS).filter((entry) => !existsSync(root + entry));
if (missing.length) {
  console.error(
    `API reference: missing declarations (${missing.join(', ')}). Run \`pnpm build\` at the repository root first.`,
  );
  process.exit(1);
}

rmSync(`${docs}api`, { recursive: true, force: true });
const app = await Application.bootstrapWithPlugins({
  entryPoints: Object.values(ENTRY_POINTS).map((entry) => root + entry),
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
    module.name = specifierOfModule(module.name) ?? module.name;
  }
});

const project = await app.convert();
if (!project) {
  console.error('API reference: TypeDoc could not read the declarations.');
  process.exit(1);
}
await app.generateOutputs(project);
console.log(`API reference: ${Object.keys(ENTRY_POINTS).length} entry points → docs/api/`);
