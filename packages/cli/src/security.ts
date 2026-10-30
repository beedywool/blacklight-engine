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
  debugger: boolean;
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

/** The line of Emscripten's embind that compiles each bound function with `new Function`. */
const EMBIND_EVAL = 'var invokerFn=newFunc(Function,args)(...closureArgs);';

/**
 * The same invoker as a closure: what Emscripten generates with `DYNAMIC_EXECUTION=0`. WebAssembly
 * libraries built with embind and dynamic execution (three's Basis transcoder for KTX2 textures)
 * otherwise need `'unsafe-eval'`, which the release CSP refuses. Variables come from
 * `craftInvokerFunction`'s scope.
 */
const EMBIND_CLOSURE = `var invokerFn=function(...invokeArgs){if(invokeArgs.length!==argCount-2){throwBindingError(\`function \${humanName} called with \${invokeArgs.length} arguments, expected \${argCount-2}\`)}var destructors=needsDestructorStack?[]:null;var thisWired;if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this)}var argsWired=[];for(var i=0;i<argCount-2;++i){argsWired.push(argTypes[i+2].toWireType(destructors,invokeArgs[i]))}var rv=isClassMethodFunc?cppInvokerFunc(cppTargetFunc,thisWired,...argsWired):cppInvokerFunc(cppTargetFunc,...argsWired);if(needsDestructorStack){runDestructors(destructors)}else{for(var j=isClassMethodFunc?1:2;j<argTypes.length;j++){var param=j===1?thisWired:argsWired[j-2];if(argTypes[j].destructorFunction!==null){argTypes[j].destructorFunction(param)}}}if(returns){return argTypes[0].fromWireType(rv)}};`;

/** embind's `val` method callers (`__emval_get_method_caller`) are compiled the same way. */
const EMVAL_EVAL = 'var invokerFunction=newFunc(Function,params)(...args);';
const EMVAL_CLOSURE = `var invokerFunction=function(obj,func,destructorsRef,argsPtr){var values=[];var offset=0;for(var i=0;i<argCount;++i){values.push(types[i].readValueFromPointer(argsPtr+offset));offset+=types[i].argPackAdvance}var rv=kind===0?func.call(obj,...values):kind===1?new func(...values):func.call(...values);if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};`;

/**
 * Replaces embind's `new Function` invokers with closures (see {@link EMBIND_CLOSURE}), so
 * WebAssembly libraries built with embind run under the release CSP.
 */
export function withoutEmbindEval(code: string): string {
  let out = code;
  if (out.includes(EMBIND_EVAL)) out = out.split(EMBIND_EVAL).join(EMBIND_CLOSURE);
  if (out.includes(EMVAL_EVAL)) out = out.split(EMVAL_EVAL).join(EMVAL_CLOSURE);
  return out;
}

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
 * Path of `pixi.js/unsafe-eval` in the Pixi copy a game bundles: the game's own when it depends on
 * Pixi (what `resolve.dedupe` picks), core's otherwise.
 */
export function resolvePixiUnsafeEval(game: NodeJS.Require, core: NodeJS.Require): string {
  let file: string;
  try {
    file = game.resolve('pixi.js/unsafe-eval');
  } catch {
    file = core.resolve('pixi.js/unsafe-eval');
  }
  return file.replace(/\.js$/, '.mjs');
}

/**
 * Vite plugin of release builds: adds the CSP to `index.html` and Pixi's eval-free code paths, and
 * obfuscates the game's chunks. Dev builds are untouched (SEC measures are off in dev).
 */
export function hardening(options: { root: string }): Plugin {
  const root = resolve(options.root);
  let settings: ResolvedSecurityLike = { obfuscate: false, csp: false, debugger: false };
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
        // patch the copy the game bundles. `resolve.dedupe` takes Pixi from the game when the game
        // depends on it (2d-with-3d does, for Three), else from core: resolve it the same way.
        const coreRequire = createRequire(require.resolve('@blacklight/core/config'));
        unsafeEvalModule = resolvePixiUnsafeEval(require, coreRequire);
      }
      // SEC-06 times a `debugger` statement; the minifier drops those by default.
      return settings.debugger
        ? {
            build: {
              rolldownOptions: { output: { minify: { compress: { dropDebugger: false } } } },
            },
          }
        : undefined;
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
      if (settings.csp) {
        for (const file of Object.values(bundle)) {
          if (file.type === 'chunk') file.code = withoutEmbindEval(file.code);
          else if (typeof file.source === 'string') file.source = withoutEmbindEval(file.source);
          else if (file.fileName.endsWith('.js')) {
            const text = new TextDecoder().decode(file.source);
            const patched = withoutEmbindEval(text);
            if (patched !== text) file.source = patched;
          }
        }
      }
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
