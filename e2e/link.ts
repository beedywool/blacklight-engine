import { copyFileSync, mkdirSync, readdirSync, realpathSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gives a copied project the packages installed in `from`: one link per package, to its real
 * folder. A single link to the whole `node_modules` does not work on Windows: pnpm's links to
 * workspace packages are relative (`..\..\..\..\..\packages\core`), and Windows resolves a
 * relative link from the path it was reached through, so behind a junction they point next to
 * the copy instead of into the checkout. Vite's own cache (`.vite`) is not shared.
 */
export function linkNodeModules(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.vite') continue;
    const source = join(from, entry.name);
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      linkNodeModules(source, join(to, entry.name));
      continue;
    }
    const target = realpathSync(source);
    // Junctions need no privileges on Windows; elsewhere the type is ignored.
    if (statSync(target).isDirectory()) symlinkSync(target, join(to, entry.name), 'junction');
    else copyFileSync(target, join(to, entry.name));
  }
}
