import type { ESLint, Linter } from 'eslint';
import { deterministic, FILE_MARKER, type DeterministicOptions } from './deterministic';

export { FILE_MARKER, type DeterministicOptions };

/**
 * Files treated as simulation code by `configs.recommended`: online scene and object folders
 * (`scenes/push-push-online/`, `objects/ball-online/`), `sim/` folders and `*.sim.ts` files.
 */
export const SIMULATION_FILES = [
  '**/*-online/**/*.{ts,mts,tsx,js,mjs,jsx}',
  '**/sim/**/*.{ts,mts,tsx,js,mjs,jsx}',
  '**/*.sim.{ts,mts,tsx,js,mjs,jsx}',
];

/** The plugin object: rules and flat configs. */
export interface BlacklightPlugin extends ESLint.Plugin {
  /** Ready-made flat configs, to spread into `eslint.config.js`. */
  configs: {
    /**
     * Turns on `blacklight/deterministic` for {@link SIMULATION_FILES} (whole files) and for
     * marked classes and files everywhere else.
     */
    recommended: Linter.Config[];
  };
}

const plugin: BlacklightPlugin = {
  meta: { name: 'eslint-plugin-blacklight', version: '0.0.0' },
  rules: { deterministic },
  configs: { recommended: [] },
};

plugin.configs.recommended.push(
  {
    name: 'blacklight/marked-simulation',
    plugins: { blacklight: plugin },
    rules: { 'blacklight/deterministic': ['error', { scope: 'marked' }] },
  },
  {
    name: 'blacklight/simulation-files',
    files: SIMULATION_FILES,
    plugins: { blacklight: plugin },
    rules: { 'blacklight/deterministic': ['error', { scope: 'file' }] },
  },
);

/**
 * The ESLint plugin of Blacklight Engine. `configs.recommended` checks the determinism of online
 * simulation code: files under {@link SIMULATION_FILES}, classes with `static deterministic =
 * true` and files with the comment `@blacklight-deterministic`.
 *
 * @example
 * ```js
 * // eslint.config.js
 * import { blacklight } from 'eslint-plugin-blacklight';
 *
 * export default [
 *   ...blacklight.configs.recommended,
 *   // more folders that hold simulation code:
 *   { files: ['src/match/**'], rules: { 'blacklight/deterministic': 'error' } },
 * ];
 * ```
 */
export const blacklight: BlacklightPlugin = plugin;
