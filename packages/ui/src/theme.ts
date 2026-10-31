import { shallowReactive, shallowRef } from 'vue';

/**
 * Design tokens of a UI theme. Every value becomes a CSS custom property on the UI root
 * (`colors.primary` → `--bl-color-primary`), so components and game styles read them.
 */
export interface Theme {
  /** Name used by `ui({ theme })`, `runtime.theme` and the settings screen. */
  name: string;
  /** Color tokens (`--bl-color-<kebab-name>`). */
  colors: {
    /** Full-screen backgrounds of menus. */
    background: string;
    /** Panels, cards, list rows. */
    surface: string;
    /** Body text. */
    text: string;
    /** Secondary text: hints, disabled rows, captions. */
    muted: string;
    /** Main brand color: selected rows, highlights. */
    primary: string;
    /** Text on `primary`. */
    onPrimary: string;
    /** Second color for accents (Persona's black-on-red, BlackLight's grey). */
    accent: string;
    /** Focus ring / focused row. */
    focus: string;
    /** Destructive actions and errors (delete a save, quit without saving). */
    danger: string;
    /** Dim layer behind modal screens. */
    scrim: string;
  };
  /** CSS font-family values (`--bl-font-body`, `--bl-font-display`, `--bl-font-mono`). */
  fonts: {
    /** Running text, lists, buttons. */
    body: string;
    /** Titles and big numbers. */
    display: string;
    /** Numbers that must not shift (timers, stats); defaults to the browser's monospace. */
    mono?: string;
  };
  /** UI sounds by asset key, played on the `ui` bus. */
  sounds?: {
    /** Focus moves to another element. */
    move?: string;
    /** An element is activated (`confirm`). */
    confirm?: string;
    /** The `back` action closes a screen. */
    back?: string;
    /** A direction finds nothing to move to. */
    error?: string;
  };
  /** Skew of Persona-style shapes, in degrees. */
  skew?: number;
  /** Corner radius of panels and buttons, as CSS (`--bl-radius`). */
  radius?: string;
  /** Extra tokens: `{ 'shadow-offset': '8px' }` → `--bl-shadow-offset`. */
  tokens?: Record<string, string>;
}

// Reactive: a theme registered after the layer started (by a scene) redraws it at once.
const themes = shallowReactive(new Map<string, Theme>());
/** Name of the active theme. */
export const activeTheme = shallowRef('blacklight');

/**
 * Registers a theme (replacing one of the same name) and returns it. Register themes before the UI
 * layer starts (or pass them to `ui({ themes })`) so a saved choice finds them.
 *
 * @example
 * ```ts
 * import { blacklightTheme, defineTheme } from '@blacklight/ui';
 *
 * defineTheme({
 *   ...blacklightTheme,
 *   name: 'forest',
 *   colors: { ...blacklightTheme.colors, primary: '#2e7d32', focus: '#a5d6a7' },
 * });
 * ```
 */
export function defineTheme(theme: Theme): Theme {
  themes.set(theme.name, theme);
  return theme;
}

/**
 * A registered theme by name (the active one by default).
 *
 * @throws When no theme has that name.
 *
 * @example
 * ```ts
 * import { getTheme } from '@blacklight/ui';
 *
 * const accent = getTheme().colors.accent;
 * ```
 */
export function getTheme(name = activeTheme.value): Theme {
  const theme = themes.get(name);
  if (!theme)
    throw new Error(`Unknown UI theme "${name}". Themes: ${[...themes.keys()].join(', ')}.`);
  return theme;
}

/**
 * Names of the registered themes, for a theme picker.
 *
 * @example
 * ```ts
 * import { themeNames, useUiRuntime } from '@blacklight/ui';
 *
 * const runtime = useUiRuntime();
 * const options = themeNames().map((name) => ({ label: name, value: name }));
 * // <Select :options v-model="runtime.theme" />
 * ```
 */
export function themeNames(): string[] {
  return [...themes.keys()];
}

const warned = new Set<string>();

/**
 * Theme to draw with: `name` when registered, else the BlackLight theme (a saved custom theme may
 * be registered later, by a scene). Warns once per missing name.
 */
export function resolveTheme(name = activeTheme.value): Theme {
  const theme = themes.get(name);
  if (theme) return theme;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(
      `[blacklight] UI theme "${name}" is not registered yet; using "blacklight". Pass it to ui({ themes }).`,
    );
  }
  return themes.get('blacklight')!;
}

/**
 * CSS custom properties of a theme, as the UI root sets them. Apply them to an element outside the
 * UI layer (a loading screen, a docs page) to style it like the game.
 *
 * @example
 * ```ts
 * import { personaTheme, themeVariables } from '@blacklight/ui';
 *
 * for (const [name, value] of Object.entries(themeVariables(personaTheme))) {
 *   splash.style.setProperty(name, value);
 * }
 * ```
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors)) vars[`--bl-color-${kebab(key)}`] = value;
  vars['--bl-font-body'] = theme.fonts.body;
  vars['--bl-font-display'] = theme.fonts.display;
  vars['--bl-font-mono'] = theme.fonts.mono ?? 'ui-monospace, monospace';
  vars['--bl-skew'] = `${theme.skew ?? 0}deg`;
  vars['--bl-radius'] = theme.radius ?? '0px';
  for (const [key, value] of Object.entries(theme.tokens ?? {})) vars[`--bl-${key}`] = value;
  return vars;
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** The BlackLight look: black surfaces, grey containers, white focus. */
export const blacklightTheme = defineTheme({
  name: 'blacklight',
  colors: {
    background: '#080808',
    surface: '#181818',
    text: '#ededed',
    muted: '#c2c2c2',
    primary: '#ffffff',
    onPrimary: '#080808',
    accent: '#303030',
    focus: '#ffffff',
    danger: '#f2b8b5',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
  fonts: { body: 'system-ui, sans-serif', display: 'system-ui, sans-serif' },
  skew: 0,
  radius: '16px',
});

/** Persona-style menus: red, black and white, skewed shapes, heavy italic type. */
export const personaTheme = defineTheme({
  name: 'persona',
  colors: {
    background: '#e60012',
    surface: '#111111',
    text: '#ffffff',
    muted: '#ffb3b8',
    primary: '#e60012',
    onPrimary: '#ffffff',
    accent: '#111111',
    focus: '#ffffff',
    danger: '#ffd60a',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
  fonts: {
    body: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif',
    display: 'Impact, "Arial Black", "Arial Narrow", sans-serif',
  },
  skew: -12,
  radius: '0px',
  tokens: { 'shadow-offset': '8px' },
});
