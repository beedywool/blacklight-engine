import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Compiler, CompilerOptions } from 'inkjs/full';
import type { Plugin } from 'vite';

/** The compiled story and every file it includes (for the watcher). */
export interface CompiledInk {
  json: string;
  files: string[];
}

/**
 * Compiles an Ink file (with its `INCLUDE`s) to the JSON the inkjs runtime loads.
 *
 * @throws Error listing every Ink error with its file and line.
 */
export function compileInk(file: string): CompiledInk {
  const files = new Set([file]);
  const source = readFileSync(file, 'utf8');
  const compiler = new Compiler(
    source,
    new CompilerOptions(file, [], false, null, {
      ResolveInkFilename: (name: string) => resolve(dirname(file), name),
      LoadInkFileContents: (path: string) => {
        files.add(path);
        return readFileSync(path, 'utf8');
      },
    }),
  );
  let story;
  try {
    story = compiler.Compile();
  } catch {
    story = undefined;
  }
  if (!story || compiler.errors.length > 0) {
    throw new Error(
      `Ink errors in ${file}:\n${compiler.errors.map((e) => `  ${e}`).join('\n') || '  compilation failed'}`,
    );
  }
  const json = story.ToJson();
  if (typeof json !== 'string') throw new Error(`Ink produced no JSON for ${file}.`);
  return { json, files: [...files] };
}

/**
 * Vite plugin: `import story from '@stories/intro.ink'` gives the compiled story (JSON), so games
 * ship no Ink compiler and no story source. Errors point at the Ink line; editing an included file
 * reloads the story.
 */
export function ink(): Plugin {
  return {
    name: 'blacklight:ink',
    enforce: 'pre',
    load(id) {
      const [path, query] = id.split('?');
      if (!path!.endsWith('.ink') || query) return undefined;
      const { json, files } = compileInk(path!);
      for (const included of files) if (included !== path) this.addWatchFile(included);
      return { code: `export default ${json};`, map: null };
    },
  };
}
