import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import type { Plugin } from 'vite';

/** Font files that are subset in release builds. */
const FONT_FILE = /\.(woff2|woff|ttf|otf)$/i;
/** `title.full.woff2` keeps every glyph (fonts used for text typed by players). */
const KEEP_FULL = /\.full\.(woff2|woff|ttf|otf)$/i;
/** Files whose characters a game can display. */
const TEXT_FILE = /\.(json|ink|vue|ts|js|txt|md|csv|vtt|srt|html)$/i;
const TEXT_DIRS = ['locales', 'stories', 'ui', 'scenes', 'objects', 'assets', 'modules'];

/**
 * Characters always kept: printable ASCII, Latin-1, general punctuation, CJK punctuation and
 * full-width forms, so numbers, prompts and player names in Latin script never miss a glyph.
 */
const ALWAYS = (() => {
  let out = '';
  const ranges: [number, number][] = [
    [0x20, 0x7e],
    [0xa0, 0xff],
    [0x2010, 0x2027],
    [0x2030, 0x205e],
    [0x20ac, 0x20ac],
    [0x3000, 0x303f],
    [0xff01, 0xff5e],
  ];
  for (const [from, to] of ranges) for (let c = from; c <= to; c++) out += String.fromCodePoint(c);
  return out;
})();

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (TEXT_FILE.test(entry.name)) out.push(path);
  }
}

/**
 * Every character the game can show: the text of locale files, Ink stories, screens, scenes,
 * objects, `.txt` / subtitle files and `game.config.ts`, plus the {@link ALWAYS} set.
 */
export function collectCharacters(root: string): string {
  const files: string[] = [];
  for (const dir of TEXT_DIRS) walk(join(root, dir), files);
  for (const config of ['game.config.ts', 'game.config.js'])
    if (existsSync(join(root, config))) files.push(join(root, config));
  const chars = new Set(ALWAYS);
  for (const file of files) for (const char of readFileSync(file, 'utf8')) chars.add(char);
  for (const control of ['\n', '\r', '\t']) chars.delete(control);
  return [...chars].sort().join('');
}

const FORMAT: Record<string, 'sfnt' | 'woff' | 'woff2'> = {
  ttf: 'sfnt',
  otf: 'sfnt',
  woff: 'woff',
  woff2: 'woff2',
};

/**
 * Keeps only the glyphs of `text` in a font, in the same format. A CJK font of 5–15 MB usually
 * drops to a few hundred KB.
 */
export async function subsetFontData(
  data: Uint8Array,
  extension: string,
  text: string,
): Promise<Buffer> {
  const format = FORMAT[extension.toLowerCase()];
  if (!format) throw new Error(`Cannot subset .${extension} fonts; use woff2, woff, ttf or otf.`);
  return subsetFont(Buffer.from(data), text, { targetFormat: format });
}

/** Result of subsetting one font, for the build log. */
export interface SubsetReport {
  file: string;
  before: number;
  after: number;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const logReport = ({ file, before, after }: SubsetReport) =>
  console.log(`  font subset ${file}: ${kb(before)} → ${kb(after)}`);

/**
 * Vite plugin for release builds: every font emitted from the game's folders is reduced to the
 * characters the game contains (CJK font subsetting, UI-15). Fonts named `*.full.<ext>` are kept
 * whole; a font that fails to subset is kept whole with a warning.
 */
export function fontSubsetting(options: {
  root: string;
  onReport?(report: SubsetReport): void;
}): Plugin {
  let text: string | undefined;
  return {
    name: 'blacklight:fonts',
    apply: 'build',
    async generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !FONT_FILE.test(output.fileName)) continue;
        const names = (output as { originalFileNames?: string[] }).originalFileNames ?? [];
        if (names.some((name) => KEEP_FULL.test(name))) continue;
        text ??= collectCharacters(options.root);
        const source =
          typeof output.source === 'string'
            ? Buffer.from(output.source)
            : Buffer.from(output.source);
        const extension = output.fileName.slice(output.fileName.lastIndexOf('.') + 1);
        try {
          const subset = await subsetFontData(source, extension, text);
          output.source = new Uint8Array(subset);
          (options.onReport ?? logReport)({
            file: output.fileName,
            before: source.length,
            after: subset.length,
          });
        } catch (error) {
          this.warn(
            `Font ${output.fileName} kept whole: subsetting failed (${error instanceof Error ? error.message : String(error)}).`,
          );
        }
      }
    },
  };
}
