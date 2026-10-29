import { shallowReactive } from 'vue';
import type { Game } from '@blacklight/core';
import type { UiStack } from './runtime';

/** One subtitle cue. Times in seconds. */
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function seconds(stamp: string): number {
  const parts = stamp.trim().replace(',', '.').split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Parses WebVTT (and SRT, whose timing lines differ only by the comma) into cues. Cue settings
 * after the timing (`align:start`) are ignored; `<v Speaker>` voice spans become `Speaker: `.
 *
 * @example
 * ```ts
 * parseVtt('WEBVTT\n\n00:00.500 --> 00:02.000\nHello');
 * // [{ start: 0.5, end: 2, text: 'Hello' }]
 * ```
 */
export function parseVtt(source: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [from, rest] = lines[timing]!.split('-->');
    const to = rest!.trim().split(/\s+/)[0]!;
    const text = lines
      .slice(timing + 1)
      .join('\n')
      .replace(/<v\s+([^>]+)>/g, '$1: ')
      .replace(/<\/?[^>]+>/g, '')
      .trim();
    if (text) cues.push({ start: seconds(from!), end: seconds(to), text });
  }
  return cues;
}

/** Text of the cues active at `time` seconds. */
export function cueAt(cues: SubtitleCue[], time: number): string {
  return cues
    .filter((cue) => time >= cue.start && time < cue.end)
    .map((cue) => cue.text)
    .join('\n');
}

const VIDEO_TYPES: Record<string, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
};

/** `true` in Safari/WebKit, which plays WebM without its alpha channel: MP4 goes first there. */
function prefersMp4(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /AppleWebKit/.test(navigator.userAgent) &&
    !/Chrome|Chromium|Android|Edg\//.test(navigator.userAgent)
  );
}

/**
 * The `<source>` list of a video: every format of the asset (`intro.webm`, `intro.mp4`), WebM VP9
 * first (alpha on desktop and Android), MP4 H.264 first on Apple WebKit. URLs are used as given.
 *
 * @example
 * ```ts
 * videoSources(game, 'intro'); // [{ src: '/assets/intro-1a2b.webm', type: 'video/webm' }, …]
 * ```
 */
export function videoSources(
  game: Pick<Game, 'assets'> | undefined,
  source: string | string[],
): { src: string; type?: string }[] {
  const list = Array.isArray(source) ? source : [source];
  const out: { src: string; type?: string }[] = [];
  for (const item of list) {
    if (/^(https?:|blob:|data:)/.test(item) || !game) {
      out.push({ src: item, type: VIDEO_TYPES[item.split('?')[0]!.split('.').pop() ?? ''] });
      continue;
    }
    const paths = game.assets.find(item, { extensions: Object.keys(VIDEO_TYPES) });
    for (const path of paths) {
      const url = game.assets.url(path);
      if (url) out.push({ src: url, type: VIDEO_TYPES[path.split('.').pop()!.toLowerCase()] });
    }
  }
  const mp4First = prefersMp4();
  const rank = (type?: string) =>
    type === 'video/webm' ? (mp4First ? 1 : 0) : type === 'video/mp4' ? (mp4First ? 0 : 1) : 2;
  return out.sort((a, b) => rank(a.type) - rank(b.type));
}

/** Loads subtitles: cues as given, a `.vtt` / `.srt` asset name or path, or a URL. */
export async function loadSubtitles(
  game: Pick<Game, 'assets'> | undefined,
  subtitles: string | SubtitleCue[] | undefined,
): Promise<SubtitleCue[]> {
  if (!subtitles) return [];
  if (Array.isArray(subtitles)) return subtitles;
  let url = subtitles;
  if (game && !/^(https?:|blob:|data:)/.test(subtitles)) {
    const path = game.assets.find(subtitles, { extensions: ['vtt', 'srt'] })[0];
    url = (path && game.assets.url(path)) || subtitles;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load subtitles ${url} (HTTP ${response.status}).`);
  return parseVtt(await response.text());
}

/** Options of {@link playCutscene}. */
export interface CutsceneOptions {
  /** Subtitles: cues, a `.vtt` asset or a URL. */
  subtitles?: string | SubtitleCue[];
  /** `hold`: hold confirm (or press back) to skip; `press`: any confirm skips; `false`: unskippable. @defaultValue `'hold'` */
  skip?: 'hold' | 'press' | false;
  /** Volume bus of the video's sound. @defaultValue `'music'` */
  bus?: 'music' | 'sfx' | 'voice';
}

/**
 * Plays a full-screen video over everything (a pushed screen) and resolves when it ends or the
 * player skips it.
 *
 * @example
 * ```ts
 * const how = await playCutscene(this.ui, 'intro', { subtitles: 'intro' });
 * // 'ended' | 'skipped'
 * ```
 */
export async function playCutscene(
  ui: UiStack,
  source: string | string[],
  options: CutsceneOptions = {},
): Promise<'ended' | 'skipped'> {
  const { default: Cutscene } = await import('./screens/Cutscene.vue');
  const result = await ui.push<'ended' | 'skipped'>(
    Cutscene,
    { source, ...options },
    { enter: 'fade', leave: 'fade' },
  ).result;
  return result ?? 'skipped';
}

/** A subtitle line shown without a video (voice barks, radio chatter). */
export interface SubtitleLine {
  id: number;
  text: string;
  speaker?: string;
}

/** Subtitles shown by {@link subtitle}, drawn by the UI root. */
export const subtitleLines: SubtitleLine[] = shallowReactive([]);
let nextSubtitle = 1;

/**
 * Shows a subtitle at the bottom of the screen for `duration` ms (or until the returned function
 * is called). Hidden when the player turned subtitles off.
 *
 * @example
 * ```ts
 * const handle = this.audio.play('radio_01', { bus: 'voice' });
 * subtitle('Bravo team, move in.', { speaker: 'Radio', until: handle.ended });
 * ```
 */
export function subtitle(
  text: string,
  options: { speaker?: string; duration?: number; until?: Promise<unknown> } = {},
): () => void {
  const line: SubtitleLine = { id: nextSubtitle++, text, speaker: options.speaker };
  subtitleLines.push(line);
  const remove = () => {
    const index = subtitleLines.indexOf(line);
    if (index >= 0) subtitleLines.splice(index, 1);
  };
  if (options.until) void options.until.then(remove, remove);
  else setTimeout(remove, options.duration ?? 3000);
  return remove;
}
