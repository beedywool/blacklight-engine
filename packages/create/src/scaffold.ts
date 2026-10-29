import { cpSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export interface ScaffoldOptions {
  /** Folder to create. */
  dir: string;
  /** Template folder name. */
  template: string;
  /** Folder holding the templates. */
  templatesDir: string;
  /** Version written for engine dependencies (`^version`). */
  engineVersion: string;
  /**
   * Path to a local engine checkout. Engine dependencies become `link:` dependencies to its
   * packages, to try unpublished changes.
   */
  link?: string;
  /** Write into a folder that is not empty. */
  force?: boolean;
}

/** Template names available in `templatesDir`. */
export function listTemplates(templatesDir: string): string[] {
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Lowercase npm-safe package name from a folder name. */
export function packageName(dir: string): string {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-~._]+/g, '-')
    .replace(/^[-._]+|-+$/g, '');
  return name || 'my-game';
}

function engineDependency(name: string, options: ScaffoldOptions): string {
  if (options.link) {
    const folder = name === 'create-blacklight' ? 'create' : name.replace(/^@blacklight\//, '');
    return `link:${join(resolve(options.link), 'packages', folder)}`;
  }
  return `^${options.engineVersion}`;
}

/**
 * Copies a template into `dir` and turns it into a standalone project.
 *
 * @throws Error when the template does not exist or `dir` is not empty (without `force`).
 */
export function scaffold(options: ScaffoldOptions): string {
  const target = resolve(options.dir);
  const templates = listTemplates(options.templatesDir);
  if (!templates.includes(options.template)) {
    throw new Error(
      `Unknown template "${options.template}". Available templates: ${templates.join(', ')}.`,
    );
  }
  if (existsSync(target) && readdirSync(target).length > 0 && !options.force) {
    throw new Error(
      `${target} is not empty. Choose another folder or pass --force to write into it.`,
    );
  }

  const source = join(options.templatesDir, options.template);
  const skip = /[\\/](node_modules|dist|\.blacklight)([\\/]|$)/;
  cpSync(source, target, {
    recursive: true,
    filter: (src) => !skip.test(src.slice(source.length)),
  });
  // npm drops .gitignore from published packages, so templates ship it as _gitignore.
  if (existsSync(join(target, '_gitignore')))
    renameSync(join(target, '_gitignore'), join(target, '.gitignore'));

  const manifestPath = join(target, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  manifest.name = packageName(target);
  for (const deps of [manifest.dependencies, manifest.devDependencies]) {
    for (const [name, range] of Object.entries(deps ?? {})) {
      if (range.startsWith('workspace:')) deps![name] = engineDependency(name, options);
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}
