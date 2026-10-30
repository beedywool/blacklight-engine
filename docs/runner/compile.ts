// Turns a set of project files into ES modules the browser can import: TypeScript is stripped with
// Sucrase (line numbers are kept), imports are rewritten to blob: URLs, engine packages come from
// the runner bundle through small shim modules.
import { transform } from 'sucrase';
import type { ProjectFiles } from './protocol';

/** Package name → loader of the module the runner bundles. */
export type PackageLoaders = Record<string, () => Promise<Record<string, unknown>>>;

const ALIASES: Record<string, string> = {
  '@objects/': 'objects/',
  '@ui/': 'ui/',
  '@modules/': 'modules/',
  '@assets/': 'assets/',
  '@models/': 'models/',
  '@stories/': 'stories/',
};
const CODE = /\.[cm]?[jt]s$/;
const STATIC_IMPORT =
  /(\bimport\s*(?:type\s+)?(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g;
const DYNAMIC_IMPORT = /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Error in a project file, with the file name in the message. */
export class CompileError extends Error {}

/** `a/b/../c` → `a/c`. */
export function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function mime(path: string): string {
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  return 'text/plain';
}

/** `true` for files given as a URL rather than as text. */
export function isUrl(content: string): boolean {
  return /^(data:|blob:|https?:|\/)/.test(content);
}

/** Compiles project files on demand and remembers the URL of every module. */
export class ModuleGraph {
  private readonly urls = new Map<string, string>();
  private readonly building = new Set<string>();
  private readonly packages = new Map<string, string>();
  private readonly created: string[] = [];
  /** blob: URL → project path, to rewrite stack traces. */
  readonly names = new Map<string, string>();

  constructor(
    private readonly files: ProjectFiles,
    private readonly loaders: PackageLoaders,
  ) {}

  /** URL of an asset file, for the engine's asset manifest. */
  assetUrl(path: string): string {
    const content = this.files[path]!;
    if (isUrl(content)) return content;
    return this.blob(content, mime(path), path);
  }

  /** Imports a project file and returns its module. */
  async import(path: string): Promise<Record<string, unknown>> {
    const url = await this.url(path, [path]);
    return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  }

  /** Loader for `import.meta.glob`-like records. */
  loader(path: string): () => Promise<Record<string, unknown>> {
    return () => this.import(path);
  }

  /** Replaces blob: URLs in a message with the file names they stand for. */
  readable(message: string): string {
    let out = message;
    for (const [url, path] of this.names) out = out.split(url).join(path);
    return out;
  }

  /** Revokes every blob: URL created for this run. */
  dispose(): void {
    for (const url of this.created) URL.revokeObjectURL(url);
  }

  private blob(content: string, type: string, path: string): string {
    const url = URL.createObjectURL(new Blob([content], { type }));
    this.created.push(url);
    this.names.set(url, path);
    return url;
  }

  private async url(path: string, chain: string[]): Promise<string> {
    const known = this.urls.get(path);
    if (known) return known;
    if (this.building.has(path)) {
      throw new CompileError(
        `Circular import: ${chain.join(' → ')}. Live examples cannot load modules that import each other; move the shared code to a third file.`,
      );
    }
    this.building.add(path);
    const content = this.files[path];
    if (content === undefined) throw new CompileError(`No file "${path}" in the project.`);
    let url: string;
    if (CODE.test(path)) url = await this.compile(path, content, chain);
    else if (path.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (error) {
        throw new CompileError(`${path}: ${(error as Error).message}`);
      }
      url = this.blob(`export default ${content};`, 'text/javascript', path);
    } else {
      // Any other file imported from code gives its URL, like Vite's asset imports.
      url = this.blob(
        `export default ${JSON.stringify(this.assetUrl(path))};`,
        'text/javascript',
        path,
      );
    }
    this.building.delete(path);
    this.urls.set(path, url);
    return url;
  }

  private async compile(path: string, source: string, chain: string[]): Promise<string> {
    let code: string;
    try {
      code = transform(source, {
        transforms: ['typescript'],
        filePath: path,
        disableESTransforms: true,
      }).code;
    } catch (error) {
      throw new CompileError(`${path}: ${(error as Error).message}`);
    }
    const specifiers = new Set<string>();
    for (const match of code.matchAll(STATIC_IMPORT)) specifiers.add(match[3]!);
    for (const match of code.matchAll(DYNAMIC_IMPORT)) specifiers.add(match[2]!);
    const resolved = new Map<string, string>();
    for (const specifier of specifiers) {
      resolved.set(specifier, await this.resolve(specifier, path, chain));
    }
    const swap = (specifier: string) => resolved.get(specifier) ?? specifier;
    code = code
      .replace(STATIC_IMPORT, (_, head: string, quote: string, specifier: string) => {
        return `${head}${quote}${swap(specifier)}${quote}`;
      })
      .replace(
        DYNAMIC_IMPORT,
        (_, quote: string, specifier: string) => `import(${quote}${swap(specifier)}${quote})`,
      );
    return this.blob(`${code}\n//# sourceURL=${path}`, 'text/javascript', path);
  }

  private async resolve(specifier: string, importer: string, chain: string[]): Promise<string> {
    const [bare, query] = specifier.split('?') as [string, string | undefined];
    if (this.loaders[bare]) return this.packageUrl(bare);
    let base: string | undefined;
    for (const [alias, dir] of Object.entries(ALIASES))
      if (bare.startsWith(alias)) base = dir + bare.slice(alias.length);
    if (base === undefined && (bare.startsWith('./') || bare.startsWith('../')))
      base = `${dirname(importer)}/${bare}`;
    if (base === undefined) {
      throw new CompileError(
        `${importer}: cannot import "${specifier}". Live examples can import ${Object.keys(this.loaders).join(', ')} and files of the project.`,
      );
    }
    const path = [base, `${base}.ts`, `${base}/index.ts`, `${base}.js`]
      .map(normalize)
      .find((candidate) => this.files[candidate] !== undefined);
    if (!path) {
      throw new CompileError(
        `${importer}: no file for "${specifier}" (looked for ${normalize(base)}, .ts, /index.ts).`,
      );
    }
    if (query === 'url' || query === 'raw') {
      const value = query === 'url' ? this.assetUrl(path) : this.files[path]!;
      return this.blob(`export default ${JSON.stringify(value)};`, 'text/javascript', path);
    }
    return this.url(path, [...chain, path]);
  }

  private async packageUrl(name: string): Promise<string> {
    const known = this.packages.get(name);
    if (known) return known;
    const module = await this.loaders[name]!();
    // The shim re-exports the runner's own instance, so games and the engine share Vue and Pixi.
    const key = JSON.stringify(name);
    const lines = [`const m = globalThis.__blacklightPackages[${key}];`];
    for (const exported of Object.keys(module)) {
      if (exported === 'default') lines.push('export default m.default;');
      else if (IDENTIFIER.test(exported)) lines.push(`export const ${exported} = m.${exported};`);
    }
    const registry = ((
      globalThis as { __blacklightPackages?: Record<string, unknown> }
    ).__blacklightPackages ??= {});
    registry[name] = module;
    const url = this.blob(lines.join('\n'), 'text/javascript', name);
    this.packages.set(name, url);
    return url;
  }
}
