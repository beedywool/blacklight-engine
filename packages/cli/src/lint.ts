import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validate, type Schema } from './json-schema';
import { loadGameConfig, scanAssets, scanObjects, scanScenes } from './project';
import { PROJECT_ALIASES } from './vite';

/** One problem found by `blacklight lint`. */
export interface LintIssue {
  /** Project-relative path, forward slashes. */
  file: string;
  /** 1-based line, when known. */
  line?: number;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

const SOURCE_DIRS = ['scenes', 'objects', 'ui', 'modules'];
const SCHEMAS = { anim: 'anim', layout: 'layout', timeline: 'timeline' } as const;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const rel = (root: string, file: string) => relative(root, file).split(sep).join('/');

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Project path of an asset reference, like the runtime's `resolveProjectPath`. */
function resolveRef(path: string, base: string): string {
  for (const [alias, dir] of Object.entries(PROJECT_ALIASES))
    if (path.startsWith(`${alias}/`)) return posix.normalize(dir + path.slice(alias.length));
  if (path.startsWith('/')) return posix.normalize(path.slice(1));
  return posix.normalize(`${base}/${path}`);
}

function loadSchema(root: string, name: string): Schema | undefined {
  try {
    const require = createRequire(join(root, 'package.json'));
    return JSON.parse(
      readFileSync(require.resolve(`@blacklight/core/schema/${name}.schema.json`), 'utf8'),
    ) as Schema;
  } catch {
    return undefined;
  }
}

/** Every `'x'` string literal in a source fragment. */
function strings(fragment: string): string[] {
  return [...fragment.matchAll(/(['"`])([^'"`]+)\1/g)].map((m) => m[2]!);
}

/** Checks a file name against its folder (`scenes/title/title.scene.ts`). */
function checkNaming(root: string, issues: LintIssue[]): void {
  const check = (dir: string, suffix: 'scene' | 'object') => {
    if (!existsSync(dir)) return;
    for (const folder of readdirSync(dir, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      for (const file of readdirSync(join(dir, folder.name))) {
        const match = new RegExp(`^(.+)\\.${suffix}\\.[cm]?[jt]s$`).exec(file);
        if (!match || match[1] === folder.name) continue;
        issues.push({
          file: rel(root, join(dir, folder.name, file)),
          rule: `${suffix}-file-name`,
          severity: 'error',
          message: `A ${suffix} file is named after its folder: rename it to ${folder.name}.${suffix}.ts.`,
        });
      }
    }
  };
  check(join(root, 'scenes'), 'scene');
  check(join(root, 'objects'), 'object');
  for (const scene of existsSync(join(root, 'scenes')) ? readdirSync(join(root, 'scenes')) : [])
    check(join(root, 'scenes', scene, 'objects'), 'object');
}

function checkJson(root: string, file: string, issues: LintIssue[]): void {
  const kind = /\.(anim|layout|timeline)\.json$/.exec(file)?.[1] as
    keyof typeof SCHEMAS | undefined;
  if (!kind) return;
  const path = rel(root, file);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    issues.push({
      file: path,
      rule: 'json-syntax',
      severity: 'error',
      message: `Invalid JSON: ${(error as Error).message}`,
    });
    return;
  }
  const schema = loadSchema(root, SCHEMAS[kind]);
  if (schema) {
    for (const error of validate(json, schema)) {
      issues.push({
        file: path,
        rule: `${kind}-schema`,
        severity: 'error',
        message: `${error.path} ${error.message}.`,
      });
    }
  }
  if (kind === 'anim') {
    const source = (json as { source?: unknown }).source;
    if (typeof source === 'string' && !existsSync(join(dirname(file), source))) {
      issues.push({
        file: path,
        rule: 'anim-source',
        severity: 'error',
        message: `"source" points to ${source}, which does not exist next to the file.`,
      });
    }
  }
  if (kind === 'layout') {
    const objects = new Set(scanObjects(root));
    for (const [i, placed] of (
      (json as { objects?: { type?: unknown }[] }).objects ?? []
    ).entries()) {
      if (typeof placed.type === 'string' && !objects.has(placed.type)) {
        issues.push({
          file: path,
          rule: 'layout-object',
          severity: 'error',
          message: `objects.${i}: unknown object "${placed.type}". Known objects: ${[...objects].join(', ') || 'none'}.`,
        });
      }
    }
  }
}

interface SourceContext {
  root: string;
  scenes: Set<string>;
  actions: Set<string> | undefined;
  assets: string[];
}

function checkSource(context: SourceContext, file: string, issues: LintIssue[]): void {
  const { root } = context;
  const text = readFileSync(file, 'utf8');
  const path = rel(root, file);
  const base = posix.dirname(path);
  const add = (index: number, rule: string, severity: LintIssue['severity'], message: string) =>
    issues.push({ file: path, line: lineOf(text, index), rule, severity, message });

  if (
    /\.(scene|object)\.[cm]?[jt]s$/.test(file) &&
    !/export\s+default\s+(abstract\s+)?class\b/.test(text)
  ) {
    add(0, 'default-export', 'error', 'Scene and object files must `export default class …`.');
  }

  for (const match of text.matchAll(
    /static\s+(?:override\s+)?assets\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g,
  )) {
    for (const entry of strings(match[1]!)) {
      const target = resolveRef(entry, base);
      const found = entry.endsWith('/')
        ? context.assets.some((a) => a.startsWith(target.replace(/\/$/, '') + '/'))
        : context.assets.some((a) => a === target || a.slice(0, a.lastIndexOf('.')) === target);
      if (!found)
        add(
          match.index,
          'missing-asset',
          'error',
          `\`static assets\` lists "${entry}" but there is no file at ${target}.`,
        );
    }
  }

  for (const match of text.matchAll(/\b(?:goto|overlay|hostScene|preload)\(\s*(['"])([^'"]+)\1/g)) {
    if (!context.scenes.has(match[2]!))
      add(
        match.index,
        'unknown-scene',
        'error',
        `Unknown scene "${match[2]}". Scenes: ${[...context.scenes].join(', ') || 'none'}.`,
      );
  }

  if (context.actions) {
    for (const match of text.matchAll(
      /\binput(?:\.player\(\s*\d+\s*\))?\.(?:pressed|held|released)\(\s*(['"])([^'"]+)\1/g,
    )) {
      if (!context.actions.has(match[2]!))
        add(
          match.index,
          'unknown-action',
          'error',
          `Unknown input action "${match[2]}". Add it to \`input.actions\` in game.config.ts.`,
        );
    }
  }

  const anim = file.replace(/\.object\.[cm]?[jt]s$/, '.anim.json');
  if (anim !== file && existsSync(anim)) {
    let names: string[] = [];
    try {
      names = Object.keys(
        (JSON.parse(readFileSync(anim, 'utf8')) as { animations?: object }).animations ?? {},
      );
    } catch {
      // Reported by checkJson.
    }
    const known = new Set(names);
    for (const match of text.matchAll(/\bthis\.play\(\s*(['"])([^'"]+)\1/g)) {
      const name = match[2]!;
      // Directional animations fall back to a near direction: `walk-left` may come from `walk-right`.
      const stem = name.replace(/-(right|downright|down|downleft|left|upleft|up|upright)$/, '');
      if (!known.has(name) && ![...known].some((k) => k.startsWith(`${stem}-`)))
        add(
          match.index,
          'unknown-animation',
          'warning',
          `"${name}" is not in ${posix.basename(rel(root, anim))} (${names.join(', ') || 'no animations'}).`,
        );
    }
  }
}

/** Runs ESLint with `eslint-plugin-blacklight` when the game has both installed. */
async function runEslint(root: string, issues: LintIssue[]): Promise<string | undefined> {
  const require = createRequire(join(root, 'package.json'));
  let eslintPath: string;
  let pluginPath: string;
  try {
    eslintPath = require.resolve('eslint');
    pluginPath = require.resolve('eslint-plugin-blacklight');
  } catch {
    return 'ESLint rules skipped: add `eslint` and `eslint-plugin-blacklight` to the game to run them.';
  }
  const { ESLint } = (await import(pathToFileURL(eslintPath).href)) as {
    ESLint: new (options: Record<string, unknown>) => {
      lintFiles(
        patterns: string[],
      ): Promise<
        {
          filePath: string;
          messages: { line: number; ruleId: string | null; severity: number; message: string }[];
        }[]
      >;
    };
  };
  const pluginModule = (await import(pathToFileURL(pluginPath).href)) as {
    default?: { configs?: Record<string, unknown> };
    configs?: Record<string, unknown>;
  };
  const plugin = pluginModule.default ?? pluginModule;
  const recommended = plugin.configs?.recommended;
  const hasOwnConfig = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'].some((f) =>
    existsSync(join(root, f)),
  );
  const eslint = new ESLint({
    cwd: root,
    errorOnUnmatchedPattern: false,
    ...(hasOwnConfig || !recommended
      ? {}
      : {
          overrideConfigFile: true,
          overrideConfig: Array.isArray(recommended) ? recommended : [recommended],
        }),
  });
  const results = await eslint.lintFiles(SOURCE_DIRS.map((d) => `${d}/**/*.{ts,js}`));
  for (const result of results) {
    for (const message of result.messages) {
      issues.push({
        file: rel(root, result.filePath),
        line: message.line,
        rule: message.ruleId ?? 'eslint',
        severity: message.severity === 2 ? 'error' : 'warning',
        message: message.message,
      });
    }
  }
  return undefined;
}

/** Result of {@link lintProject}. */
export interface LintResult {
  issues: LintIssue[];
  /** Things that were not checked, and why. */
  notes: string[];
}

/**
 * Runs the engine's checks on a game: file naming, `game.config.ts`, the JSON files against their
 * schemas, asset, scene, action and animation names used in code, then ESLint with
 * `eslint-plugin-blacklight` when installed.
 */
export async function lintProject(
  root: string,
  options: { eslint?: boolean } = {},
): Promise<LintResult> {
  const issues: LintIssue[] = [];
  const notes: string[] = [];
  let actions: Set<string> | undefined;
  try {
    const config = await loadGameConfig(root);
    actions = new Set(Object.keys(config.input?.actions ?? {}));
  } catch (error) {
    issues.push({
      file: 'game.config.ts',
      rule: 'config',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    notes.push('Input actions not checked: game.config.ts did not load.');
  }
  checkNaming(root, issues);
  const files = SOURCE_DIRS.flatMap((dir) => walk(join(root, dir)));
  for (const dir of ['animations']) files.push(...walk(join(root, dir)));
  const context: SourceContext = {
    root,
    scenes: new Set(scanScenes(root)),
    actions,
    assets: scanAssets(root),
  };
  for (const file of files) {
    if (file.endsWith('.json')) checkJson(root, file, issues);
    else if (/\.[cm]?[jt]s$/.test(file) && !file.endsWith('.d.ts'))
      checkSource(context, file, issues);
  }
  if (options.eslint !== false) {
    const note = await runEslint(root, issues);
    if (note) notes.push(note);
  }
  issues.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  return { issues, notes };
}

/** Human-readable report; `file:line  severity  message  (rule)`. */
export function formatLint({ issues, notes }: LintResult, color = false): string {
  const paint = (code: number, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const lines = issues.map(
    (i) =>
      `${i.file}${i.line ? `:${i.line}` : ''}  ${i.severity === 'error' ? paint(31, 'error') : paint(33, 'warning')}  ${i.message}  ${paint(2, `(${i.rule})`)}`,
  );
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  lines.push(...notes.map((n) => paint(2, n)));
  lines.push(
    issues.length === 0
      ? paint(32, 'No problems found.')
      : `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`,
  );
  return lines.join('\n');
}
