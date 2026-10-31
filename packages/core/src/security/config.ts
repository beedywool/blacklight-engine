/** Obfuscation strength of release builds (SEC-03). */
export type ObfuscationLevel = 'low' | 'medium' | 'high';

/** What was tampered with, passed to `game.on('tamper', …)`. */
export interface TamperEvent {
  /**
   * `value`: a protected value changed outside the game (memory editor). `debugger`: a debugger
   * paused the game. `devtools`: developer tools were opened in a release build.
   */
  kind: 'value' | 'debugger' | 'devtools';
  /** Protected path (`'Player.hp'`, `'save.gold'`) for `value`. */
  path?: string;
  /** Value the game wrote last. */
  expected?: unknown;
  /** Value found in memory. */
  found?: unknown;
  /** Puts the expected value back (no-op for other kinds). */
  restore(): void;
}

/** Extra CSP sources, merged into the engine's strict policy. */
export interface CspSources {
  /** `connect-src`: your APIs and WebSocket servers, e.g. `['https://api.example.com', 'wss://relay.example.com']`. */
  connect?: string[];
  /** `img-src`. */
  img?: string[];
  /** `media-src`. */
  media?: string[];
  /** `font-src`. */
  font?: string[];
}

/**
 * `security` in `game.config.ts`. Every measure is off in dev builds and on by default in release
 * builds; set one to `false` to turn it off, or `security: false` to turn them all off.
 *
 * @example
 * ```ts
 * security: {
 *   obfuscate: 'low',
 *   protect: ['Player.hp', 'save.gold'],
 *   csp: { connect: ['https://api.example.com'] },
 * }
 * ```
 */
export interface SecurityConfig {
  /** SEC-01: no developer tools, F12, Ctrl/Cmd+Shift+I, context menu or `--devtools`. */
  devtools?: boolean;
  /** SEC-02 (desktop): Electron fuses and ASAR integrity. */
  fuses?: boolean;
  /** SEC-03: JavaScript obfuscation of the game's code; `true` is `'low'`. */
  obfuscate?: boolean | ObfuscationLevel;
  /** SEC-04 (desktop): main-process code compiled to V8 bytecode. */
  bytecode?: boolean;
  /** SEC-05: values watched for memory edits: `'<ObjectName>.<field>'`, `'<scene>.<field>'` or `'save.<field>'`. */
  protect?: string[];
  /** SEC-06: detect a debugger pausing the game. */
  debugger?: boolean;
  /** SEC-07 (mobile): the WebView cannot be inspected. */
  webview?: boolean;
  /** SEC-08: strict Content Security Policy, no `eval`; an object adds allowed sources. */
  csp?: boolean | CspSources;
  /**
   * SEC-09: reaction when nothing listens to `game.on('tamper')`: `'restore'` puts the value back
   * and logs, `'quit'` also closes the game. @defaultValue `'restore'`
   */
  onTamper?: 'restore' | 'quit';
}

/** {@link SecurityConfig} with the defaults of this build applied. */
export interface ResolvedSecurity {
  /** SEC-01: developer tools are blocked. */
  devtools: boolean;
  /** SEC-02: Electron fuses and ASAR integrity are set. */
  fuses: boolean;
  /** SEC-03: obfuscation level, `false` when off. */
  obfuscate: ObfuscationLevel | false;
  /** SEC-04: main-process code is compiled to V8 bytecode. */
  bytecode: boolean;
  /** SEC-05: watched value paths. */
  protect: string[];
  /** SEC-06: a debugger pausing the game is detected. */
  debugger: boolean;
  /** SEC-07: the mobile WebView cannot be inspected. */
  webview: boolean;
  /** SEC-08: extra CSP sources, `false` when the policy is off. */
  csp: CspSources | false;
  /** SEC-09: reaction to tampering when nothing listens to `game.on('tamper')`. */
  onTamper: 'restore' | 'quit';
}

/**
 * Default obfuscation level. SEC-10 caps the cost of obfuscation and bytecode at 10 %: `low` stays
 * under it on the reference benchmark (`packages/cli/test/obfuscation-cost.spec.ts`), `medium` and
 * `high` do not, so they are opt-in.
 */
export const DEFAULT_OBFUSCATION: ObfuscationLevel = 'low';

const MEASURES = ['devtools', 'fuses', 'bytecode', 'debugger', 'webview'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks `security` from `game.config.ts`; returns one readable line per problem (empty when
 * valid). `resolveConfig` calls it with the rest of the configuration.
 *
 * @example
 * ```ts
 * import { validateSecurityConfig } from '@blacklight/core';
 *
 * validateSecurityConfig({ obfuscate: 'max' });
 * // ['`security.obfuscate` must be a boolean or "low", "medium", "high"']
 * ```
 */
export function validateSecurityConfig(security: unknown): string[] {
  if (security === undefined || typeof security === 'boolean') return [];
  if (!isRecord(security)) {
    return ['`security` must be `false` or an object, e.g. `security: { obfuscate: "low" }`'];
  }
  const issues: string[] = [];
  const known = [...MEASURES, 'obfuscate', 'protect', 'csp', 'onTamper'];
  for (const key of Object.keys(security)) {
    if (!known.includes(key))
      issues.push(`\`security.${key}\` is unknown; known: ${known.join(', ')}`);
  }
  for (const key of MEASURES) {
    if (security[key] !== undefined && typeof security[key] !== 'boolean') {
      issues.push(`\`security.${key}\` must be a boolean`);
    }
  }
  const { obfuscate, protect, csp, onTamper } = security;
  if (
    obfuscate !== undefined &&
    typeof obfuscate !== 'boolean' &&
    !['low', 'medium', 'high'].includes(obfuscate as string)
  ) {
    issues.push('`security.obfuscate` must be a boolean or "low", "medium", "high"');
  }
  if (protect !== undefined) {
    if (!Array.isArray(protect)) {
      issues.push('`security.protect` must be a list of paths, e.g. `["Player.hp", "save.gold"]`');
    } else {
      for (const path of protect) {
        if (typeof path !== 'string' || !/^[A-Za-z_$][\w$-]*(\.[\w$-]+)+$/.test(path)) {
          issues.push(
            `\`security.protect\`: "${String(path)}" must be "<ObjectName>.<field>", "<scene>.<field>" or "save.<field>"`,
          );
        }
      }
    }
  }
  if (csp !== undefined && typeof csp !== 'boolean') {
    if (!isRecord(csp)) {
      issues.push('`security.csp` must be a boolean or `{ connect?, img?, media?, font? }`');
    } else {
      for (const [key, list] of Object.entries(csp)) {
        if (!['connect', 'img', 'media', 'font'].includes(key)) {
          issues.push(`\`security.csp.${key}\` is unknown; use connect, img, media or font`);
        } else if (
          !Array.isArray(list) ||
          list.some((s) => typeof s !== 'string' || /[;,\s]/.test(s) || s.includes("'unsafe"))
        ) {
          issues.push(
            `\`security.csp.${key}\` must list sources such as "https://api.example.com" (no spaces, semicolons or 'unsafe-…')`,
          );
        }
      }
    }
  }
  if (onTamper !== undefined && onTamper !== 'restore' && onTamper !== 'quit') {
    issues.push('`security.onTamper` must be "restore" or "quit"');
  }
  return issues;
}

/**
 * Applies the defaults: every measure is on in release builds unless turned off, off in dev.
 * The CLI, the desktop app and the mobile build read the same result.
 *
 * @example
 * ```ts
 * resolveSecurity({ obfuscate: false }, true).devtools; // true
 * resolveSecurity({ obfuscate: false }, false).devtools; // false
 * ```
 */
export function resolveSecurity(
  security: SecurityConfig | boolean | undefined,
  release: boolean,
): ResolvedSecurity {
  const on = release && security !== false;
  const config = isRecord(security) ? (security as SecurityConfig) : {};
  const flag = (value: boolean | undefined) => on && value !== false;
  const obfuscate = config.obfuscate;
  return {
    devtools: flag(config.devtools),
    fuses: flag(config.fuses),
    obfuscate:
      !on || obfuscate === false
        ? false
        : typeof obfuscate === 'string'
          ? obfuscate
          : DEFAULT_OBFUSCATION,
    bytecode: flag(config.bytecode),
    protect: on ? (config.protect ?? []) : [],
    debugger: flag(config.debugger),
    webview: flag(config.webview),
    csp: !on || config.csp === false ? false : isRecord(config.csp) ? config.csp : {},
    onTamper: config.onTamper ?? 'restore',
  };
}

/**
 * The Content Security Policy of release builds: scripts only from the game itself (WebAssembly
 * allowed, `eval` and inline scripts refused), no plugins, no framing of other origins.
 *
 * `style-src 'unsafe-inline'` stays: Vue and the engine set element styles at runtime, which is not
 * script execution.
 *
 * @example
 * ```ts
 * import { contentSecurityPolicy } from '@blacklight/core/config';
 *
 * const policy = contentSecurityPolicy({ connect: ['https://api.example.com'] });
 * // "default-src 'self'; … connect-src 'self' data: blob: https://api.example.com; …"
 * ```
 */
export function contentSecurityPolicy(sources: CspSources = {}): string {
  const list = (base: string[], extra: string[] = []) => [...base, ...extra].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list(["'self'", 'data:', 'blob:'], sources.img)}`,
    `media-src ${list(["'self'", 'data:', 'blob:'], sources.media)}`,
    `font-src ${list(["'self'", 'data:'], sources.font)}`,
    `connect-src ${list(["'self'", 'data:', 'blob:'], sources.connect)}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
