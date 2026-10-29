// Release-build hardening done at build time: strict CSP (SEC-08) and obfuscation of the game's
// own code (SEC-03). Runtime measures live in @blacklight/core (security/) and the desktop app.

import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { loadGameConfig } from './project';

type ObfuscationLevel = 'low' | 'medium' | 'high';

interface ResolvedSecurityLike {
  obfuscate: ObfuscationLevel | false;
  csp: Record<string, string[]> | false;
}

interface CoreConfigModule {
  resolveSecurity(security: unknown, release: boolean): ResolvedSecurityLike;
  contentSecurityPolicy(sources?: Record<string, string[]>): string;
}

/**
 * javascript-obfuscator options per level. None of them generates `eval` or `new Function` (the
 * CSP forbids both): `debugProtection` stays off, debugger detection is the engine's (SEC-06).
 */
export const OBFUSCATION_LEVELS: Record<ObfuscationLevel, Record<string, unknown>> = {
  low: {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.5,
    stringArrayEncoding: [],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    numbersToExpressions: false,
    transformObjectKeys: false,
    selfDefending: false,
    debugProtection: false,
    unicodeEscapeSequence: false,
  },
  medium: {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayWrappersCount: 2,
    stringArrayWrappersType: 'function',
    splitStrings: true,
    splitStringsChunkLength: 8,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: false,
    numbersToExpressions: true,
    transformObjectKeys: true,
    selfDefending: false,
    debugProtection: false,
    unicodeEscapeSequence: false,
  },
  high: {
    compact: true,
    simplify: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 1,
    stringArrayEncoding: ['rc4'],
    stringArrayWrappersCount: 5,
    stringArrayWrappersType: 'function',
    splitStrings: true,
    splitStringsChunkLength: 5,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    numbersToExpressions: true,
    transformObjectKeys: true,
    selfDefending: true,
    debugProtection: false,
    unicodeEscapeSequence: false,
  },
};

/** Obfuscates one ES module chunk. */
export async function obfuscate(code: string, level: ObfuscationLevel): Promise<string> {
  const { default: obfuscator } = (await import('javascript-obfuscator')) as unknown as {
    default: {
      obfuscate(code: string, options: Record<string, unknown>): { getObfuscatedCode(): string };
    };
  };
  return obfuscator
    .obfuscate(code, { ...OBFUSCATION_LEVELS[level], target: 'browser', sourceMap: false, seed: 0 })
    .getObfuscatedCode();
}

/**
 * `true` when most of a chunk is the game's own code (not engine or library code, which is open
 * source anyway and would only get slower).
 */
export function isGameChunk(
  root: string,
  modules: Record<string, { renderedLength: number }>,
): boolean {
  let game = 0;
  let total = 0;
  for (const [id, info] of Object.entries(modules)) {
    const path = id.replace(/^\0/, '').split('?')[0]!;
    total += info.renderedLength;
    const rel = relative(root, path);
    if (
      !rel.startsWith('..') &&
      !rel.startsWith(sep) &&
      !rel.split(sep).includes('node_modules') &&
      !rel.startsWith(`.blacklight${sep}`)
    ) {
      game += info.renderedLength;
    }
  }
  return total > 0 && game / total >= 0.5;
}

/**
 * Vite plugin of release builds: adds the CSP to `index.html` and Pixi's eval-free code paths, and
 * obfuscates the game's chunks. Dev builds are untouched (SEC measures are off in dev).
 */
export function hardening(options: { root: string }): Plugin {
  const root = resolve(options.root);
  let settings: ResolvedSecurityLike = { obfuscate: false, csp: false };
  let policy = '';
  let unsafeEvalModule = '';
  return {
    name: 'blacklight:hardening',
    async config(_, env) {
      if (env.command !== 'build') return;
      const require = createRequire(join(root, 'package.json'));
      const core = (await import(
        pathToFileURL(require.resolve('@blacklight/core/config')).href
      )) as CoreConfigModule;
      const config = (await loadGameConfig(root)) as { security?: unknown };
      settings = core.resolveSecurity(config.security, true);
      if (settings.csp) {
        policy = core.contentSecurityPolicy(settings.csp);
        // Pixi compiles shader sync code with `new Function` unless this module is loaded; it must
        // be the copy core uses.
        const coreRequire = createRequire(require.resolve('@blacklight/core/config'));
        unsafeEvalModule = coreRequire.resolve('pixi.js/unsafe-eval').replace(/\.js$/, '.mjs');
      }
    },
    transform(code, id) {
      const file = id.split('?')[0]!.replace(/\\/g, '/');
      if (!unsafeEvalModule || !file.endsWith('/.blacklight/main.ts')) return undefined;
      return { code: `import ${JSON.stringify(unsafeEvalModule)};\n${code}`, map: null };
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!policy) return html;
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
    async generateBundle(_, bundle) {
      const level = settings.obfuscate;
      if (!level) return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !isGameChunk(root, chunk.modules)) continue;
        chunk.code = await obfuscate(chunk.code, level);
        chunk.map = null;
      }
    },
  };
}
