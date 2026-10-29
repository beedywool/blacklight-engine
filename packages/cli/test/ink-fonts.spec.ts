import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Story } from 'inkjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectCharacters, fontSubsetting, subsetFontData } from '../src/fonts';
import { compileInk, ink } from '../src/ink';
import { scanAssets } from '../src/project';

let root: string;
const file = (path: string, content: string | Buffer) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'blacklight-ink-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('Ink compilation (UI-10)', () => {
  it('compiles a story with includes into JSON the runtime plays', () => {
    file('stories/main.ink', 'INCLUDE chapter.ink\nVAR met = false\nHello. # portrait: mira happy\n-> chapter\n');
    file('stories/chapter.ink', '=== chapter ===\n* [Wave]\n  ~ met = true\n  Hi!\n- -> END\n');
    const { json, files } = compileInk(join(root, 'stories/main.ink'));
    expect(files).toHaveLength(2);
    const story = new Story(json);
    expect(story.Continue()).toBe('Hello.\n');
    expect(story.currentTags).toEqual(['portrait: mira happy']);
    expect(story.canContinue).toBe(false);
    expect(story.currentChoices.map((c) => c.text)).toEqual(['Wave']);
  });

  it('reports Ink errors with the line', () => {
    file('stories/bad.ink', 'Hello\n* [Unclosed\n');
    expect(() => compileInk(join(root, 'stories/bad.ink'))).toThrow(/Ink errors in .*bad\.ink:\n.*line 2/);
  });

  it('the Vite plugin turns .ink imports into modules and leaves ?url alone', async () => {
    file('stories/a.ink', 'One line.\n');
    const plugin = ink();
    const load = plugin.load as (this: unknown, id: string) => { code: string } | undefined;
    const context = { addWatchFile() {} };
    const result = load.call(context, join(root, 'stories/a.ink'));
    expect(result?.code).toMatch(/^export default \{"inkVersion":/);
    expect(load.call(context, `${join(root, 'stories/a.ink')}?url`)).toBeUndefined();
  });

  it('keeps .ink sources out of the asset manifest and serves subtitles', () => {
    file('stories/a.ink', 'x');
    file('assets/video/intro.vtt', 'WEBVTT');
    expect(scanAssets(root)).toEqual(['assets/video/intro.vtt']);
  });
});

const fixtureFont = join(import.meta.dirname, '../../../docs/.vitepress/theme/fonts/google-sans-flex-latin.woff2');

describe('font subsetting (UI-15)', () => {
  it('collects the characters of locales, stories and screens', () => {
    file('locales/ja.json', '{"title":"夜明けの街"}');
    file('stories/main.ink', 'مرحبا');
    file('ui/Title.vue', '<template>Ω</template>');
    const chars = collectCharacters(root);
    for (const c of '夜明けの街مرحباΩAz0!') expect(chars).toContain(c);
    expect(chars).not.toContain('漢');
    expect(chars).not.toContain('\n');
  });

  it('subsets a font to the given characters, keeping its format', async () => {
    const source = readFileSync(fixtureFont);
    const subset = await subsetFontData(source, 'woff2', 'Blacklight');
    expect(subset.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(subset.length).toBeLessThan(source.length / 2);
  });

  it('the Vite plugin subsets emitted fonts and keeps *.full.* fonts whole', async () => {
    file('locales/en.json', '{"hello":"Hi"}');
    const source = readFileSync(fixtureFont);
    const bundle = {
      a: { type: 'asset', fileName: 'assets/body-abc.woff2', originalFileNames: ['assets/body.woff2'], source: new Uint8Array(source) },
      b: { type: 'asset', fileName: 'assets/name-abc.woff2', originalFileNames: ['assets/name.full.woff2'], source: new Uint8Array(source) },
    };
    const reports: string[] = [];
    const plugin = fontSubsetting({ root, onReport: (r) => reports.push(r.file) });
    const generate = plugin.generateBundle as (this: unknown, o: unknown, b: typeof bundle) => Promise<void>;
    await generate.call({ warn: (m: string) => reports.push(m) }, {}, bundle);
    expect(reports).toEqual(['assets/body-abc.woff2']);
    expect(bundle.a.source.length).toBeLessThan(source.length);
    expect(bundle.b.source.length).toBe(source.length);
  });
});
