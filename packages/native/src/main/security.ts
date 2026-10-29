// Main-process side of SEC-01: debugging switches, developer-tools shortcuts and menus.

/** Command-line switches that open a debugger or developer tools. */
export const DEBUG_SWITCHES = [
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-publish-uid',
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-allow-origins',
  'devtools',
  'auto-open-devtools-for-tabs',
  'js-flags',
] as const;

/** The debugging switches present in `argv` (`--inspect=9229` → `inspect`). */
export function debugSwitches(argv: readonly string[]): string[] {
  const found = new Set<string>();
  for (const arg of argv) {
    const match = /^--?([a-z-]+)(?:=.*)?$/.exec(arg);
    if (match && (DEBUG_SWITCHES as readonly string[]).includes(match[1]!)) found.add(match[1]!);
  }
  return [...found];
}

/** A keyboard input as Electron's `before-input-event` reports it. */
export interface KeyInput {
  type: string;
  key: string;
  code: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/** What a key press does in the desktop app. */
export type KeyAction = 'devtools' | 'reload' | 'fullscreen' | undefined;

/** Recognizes developer-tools, reload and fullscreen shortcuts on every OS. */
export function classifyKey(input: KeyInput): KeyAction {
  if (input.type !== 'keyDown') return undefined;
  const mod = input.control || input.meta;
  // Synthesized events (sendInputEvent, automation) may come without a code: derive it from the key.
  const code =
    input.code ||
    (/^F\d{1,2}$/.test(input.key) || input.key === 'Enter'
      ? input.key
      : /^[a-z]$/i.test(input.key)
        ? `Key${input.key.toUpperCase()}`
        : '');
  if (code === 'F12') return 'devtools';
  if (mod && (input.shift || input.alt) && ['KeyI', 'KeyJ', 'KeyC'].includes(code))
    return 'devtools';
  if (mod && code === 'KeyU') return 'devtools';
  if (code === 'F5' || (mod && code === 'KeyR')) return 'reload';
  if (code === 'F11' || (input.alt && code === 'Enter')) return 'fullscreen';
  if (input.meta && input.control && code === 'KeyF') return 'fullscreen';
  return undefined;
}
