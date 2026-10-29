import { Story } from 'inkjs';
import { markRaw, reactive } from 'vue';
import { EventBus, type Game, type SoundHandle } from '@blacklight/core';
import { plainText } from './richtext';

/** A compiled Ink story: the JSON object (from `import story from '@stories/main.ink'`) or its text. */
export type InkStory = object | string;

/** One parsed Ink tag: `# portrait: mira happy` → `{ name: 'portrait', value: 'mira happy' }`. */
export interface DialogueTag {
  name: string;
  value: string;
}

/** A character on stage. */
export interface Portrait {
  character: string;
  expression: string;
  /** `left`, `center` or `right`. */
  position: 'left' | 'center' | 'right';
}

/** One line of dialogue as shown in the box. */
export interface DialogueLine {
  /** Text with rich-text tags, without the speaker prefix. */
  text: string;
  /** Speaker id (`Mira: Hello` or `# speaker: mira`), `undefined` for narration. */
  speaker?: string;
  tags: DialogueTag[];
  /** Voice asset played with the line (`# voice: mira_01`). */
  voice?: string;
  /** Stable id of the line (story position + text), used for read-line tracking. */
  id: string;
}

/** A choice offered to the player. */
export interface DialogueChoice {
  index: number;
  text: string;
  tags: DialogueTag[];
}

/** An entry of the backlog (history). */
export interface BacklogEntry {
  speaker?: string;
  text: string;
  voice?: string;
  /** `true` for a choice the player picked. */
  choice?: boolean;
}

/** JSON state of a dialogue: put it in your save and pass it back to {@link Dialogue.restore}. */
export interface DialogueState {
  version: 1;
  /** Ink's own state (`story.state.toJson()`): variables, visit counts, position. */
  ink: string;
  line: DialogueLine | null;
  choices: DialogueChoice[];
  backlog: BacklogEntry[];
  portraits: Portrait[];
  ended: boolean;
  locale?: string;
}

export interface DialogueEvents {
  /** A new line is shown. */
  line: { line: DialogueLine };
  /** Choices are offered. */
  choices: { choices: DialogueChoice[] };
  /** A tag was read. Built-in tags are handled before this fires. */
  tag: { tag: DialogueTag; line: DialogueLine | null };
  /** The story reached its end. */
  end: void;
}

/** Options of a {@link Dialogue}. */
export interface DialogueOptions {
  /** Plays voice, sound and music tags; without it those tags are only reported. */
  game?: Game;
  /** Language of the story when `story` maps languages to stories. */
  locale?: string;
  /** Maximum backlog entries kept. @defaultValue `200` */
  backlogSize?: number;
  /**
   * Remembers which lines were read (for skip mode) in `game.settings` under this key.
   * @defaultValue `'dialogue.read'`
   */
  readKey?: string;
}

const SPEAKER = /^\s*([^:<>\n#{}]{1,40}?):\s+([\s\S]*)$/;

/** Parses `name: value`, `name value` or `name` (Ink tags are free text). */
export function parseTag(raw: string): DialogueTag {
  const text = raw.trim();
  const colon = text.indexOf(':');
  if (colon > 0 && /^[\w-]+$/.test(text.slice(0, colon).trim()))
    return { name: text.slice(0, colon).trim().toLowerCase(), value: text.slice(colon + 1).trim() };
  const space = text.search(/\s/);
  if (space > 0)
    return { name: text.slice(0, space).toLowerCase(), value: text.slice(space + 1).trim() };
  return { name: text.toLowerCase(), value: '' };
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * An Ink story driving dialogue (UI-10): lines with speakers, choices, variables, tags for
 * portraits, sounds and effects, a backlog, read-line tracking for skip mode, and a JSON state for
 * saves. Show it with `<DialogueBox :dialogue>`.
 *
 * Built-in tags: `speaker`, `portrait: <character> <expression> [left|center|right]`,
 * `expression: <expression>` (current speaker), `hide: <character>`, `clear`, `voice: <asset>`,
 * `sfx: <asset>`, `music: <asset>|stop`. Every tag, built-in or not, is also emitted as a `tag`
 * event (`bg`, `transition`, `fx`, `unlock`… are for your scene to handle).
 *
 * @example
 * ```ts
 * import story from '@stories/intro.ink';
 * const dialogue = new Dialogue(story, { game: this.game });
 * dialogue.events.on('tag', ({ tag }) => tag.name === 'bg' && this.showBackground(tag.value));
 * dialogue.start();
 * this.ui.open('StoryScreen', { dialogue });
 * ```
 */
export class Dialogue {
  /** The inkjs story (variables, external functions, flows). */
  story: Story;
  readonly events = new EventBus<DialogueEvents>();
  /** Reactive view of the dialogue for components. */
  readonly view: {
    line: DialogueLine | null;
    choices: DialogueChoice[];
    backlog: BacklogEntry[];
    portraits: Portrait[];
    ended: boolean;
  };
  private readonly stories: Record<string, InkStory>;
  private locale: string | undefined;
  private voice: SoundHandle | undefined;
  private readonly read: Set<string>;
  private readonly bindings = new Map<string, (...args: unknown[]) => unknown>();

  constructor(
    story: InkStory | Record<string, InkStory>,
    private readonly options: DialogueOptions = {},
  ) {
    this.stories = isLanguageMap(story) ? story : { default: story };
    this.locale = options.locale;
    this.story = markRaw(this.load(this.pick()));
    this.view = reactive({ line: null, choices: [], backlog: [], portraits: [], ended: false });
    const saved = options.game?.settings.get<string[]>(this.readKey) ?? [];
    this.read = new Set(saved);
  }

  private get readKey(): string {
    return this.options.readKey ?? 'dialogue.read';
  }

  private pick(): InkStory {
    const langs = Object.keys(this.stories);
    const lang =
      (this.locale && langs.find((l) => l === this.locale)) ??
      (this.locale && langs.find((l) => l.split('-')[0] === this.locale!.split('-')[0])) ??
      langs[0]!;
    return this.stories[lang]!;
  }

  private load(source: InkStory): Story {
    try {
      const story = new Story(typeof source === 'string' ? source : JSON.stringify(source));
      // Ink reports authoring notes and warnings through the same handler; only errors stop.
      story.onError = (message, type) => {
        if (Number(type) >= 2) throw new Error(`Ink error: ${message}`);
        console.warn(`[blacklight] Ink: ${message}`);
      };
      for (const [name, fn] of this.bindings) story.BindExternalFunction(name, fn);
      return story;
    } catch (error) {
      throw new Error(
        `Could not load the Ink story: ${error instanceof Error ? error.message : String(error)}. Import .ink files from stories/ (the CLI compiles them) or pass the JSON from inklecate.`,
        { cause: error },
      );
    }
  }

  /** The current line, `null` before the start and after the end. */
  get line(): DialogueLine | null {
    return this.view.line;
  }

  /** Choices offered now (empty while lines play). */
  get choices(): DialogueChoice[] {
    return this.view.choices;
  }

  /** `true` once the story ended. */
  get ended(): boolean {
    return this.view.ended;
  }

  /**
   * Ink variables, read and written by name. Conditions in the story (`{met_mira: …}`) see the
   * new values.
   *
   * @example
   * ```ts
   * dialogue.vars.player_name = 'Aoi';
   * if (dialogue.vars.trust > 2) unlockEnding();
   * ```
   */
  get vars(): Record<string, unknown> {
    const state = this.story.variablesState;
    return new Proxy({} as Record<string, unknown>, {
      get: (_, name) => (typeof name === 'string' ? state.$(name) : undefined),
      set: (_, name, value) => {
        if (typeof name !== 'string') return false;
        state.$(name, value as never);
        return true;
      },
    });
  }

  /** Calls `fn` when Ink calls the external function `name` (declare it with `EXTERNAL name()`). */
  bind(name: string, fn: (...args: unknown[]) => unknown): void {
    this.bindings.set(name, fn);
    this.story.BindExternalFunction(name, fn);
  }

  /** Calls `fn` whenever the Ink variable `name` changes. */
  observe(name: string, fn: (value: unknown) => void): void {
    this.story.ObserveVariable(name, (_, value) => fn(value));
  }

  /**
   * Starts (or restarts) at the beginning, or at a knot / stitch path. `vars` are set after the
   * reset, before the first line (a player name typed on the title screen).
   */
  start(path?: string, vars: Record<string, unknown> = {}): void {
    this.story.ResetState();
    for (const [name, value] of Object.entries(vars)) this.vars[name] = value;
    if (path) this.story.ChoosePathString(path);
    this.view.backlog.splice(0);
    this.view.portraits.splice(0);
    this.view.ended = false;
    this.next();
  }

  /** Jumps to a knot or stitch (`chapter2.intro`) and shows its first line. */
  jump(path: string): void {
    this.story.ChoosePathString(path);
    this.view.ended = false;
    this.next();
  }

  /**
   * Shows the next line. Does nothing while choices are offered (pick one with {@link choose}).
   *
   * @returns `false` when nothing advanced (choices pending, or the end).
   */
  next(): boolean {
    if (this.view.choices.length > 0) return false;
    this.voice?.stop();
    this.voice = undefined;
    while (this.story.canContinue) {
      const raw = this.story.Continue() ?? '';
      const tags = (this.story.currentTags ?? []).map(parseTag);
      const text = raw.trim();
      if (!text) {
        // Tag-only lines (`# bg: night` on its own) still apply.
        for (const tag of tags) this.applyTag(tag, null);
        continue;
      }
      this.show(text, tags);
      return true;
    }
    this.view.line = null;
    if (this.story.currentChoices.length > 0) {
      this.view.choices = this.story.currentChoices.map((choice) => ({
        index: choice.index,
        text: choice.text,
        tags: (choice.tags ?? []).map(parseTag),
      }));
      this.events.emit('choices', { choices: this.view.choices });
      return true;
    }
    this.view.ended = true;
    this.events.emit('end');
    return false;
  }

  /** Picks a choice by its index in {@link choices}, then shows the next line. */
  choose(index: number): void {
    const choice = this.view.choices.find((c) => c.index === index);
    if (!choice) {
      throw new Error(
        `No choice ${index}: the dialogue offers ${this.view.choices.length} (indexes ${this.view.choices.map((c) => c.index).join(', ') || 'none'}).`,
      );
    }
    this.view.choices = [];
    this.pushBacklog({ text: choice.text, choice: true });
    this.story.ChooseChoiceIndex(index);
    this.next();
  }

  /** `true` when the player already read `line` (in this or an earlier playthrough). */
  isRead(line: DialogueLine | null = this.view.line): boolean {
    return !!line && this.read.has(line.id);
  }

  private show(text: string, tags: DialogueTag[]): void {
    const match = SPEAKER.exec(text);
    let speaker = match ? match[1]!.trim() : undefined;
    const body = match ? match[2]! : text;
    for (const tag of tags) if (tag.name === 'speaker') speaker = tag.value || undefined;
    const id = hash(`${this.story.state.currentPathString ?? ''}|${body}`);
    const line: DialogueLine = {
      text: wrapByTags(body, tags),
      speaker,
      tags,
      voice: tags.find((t) => t.name === 'voice')?.value,
      id,
    };
    if (this.view.line) this.markRead(this.view.line);
    this.view.line = line;
    for (const tag of tags) this.applyTag(tag, line);
    this.pushBacklog({ speaker, text: line.text, voice: line.voice });
    this.events.emit('line', { line });
  }

  /** @internal Marks the current line as read (the box calls it when the player moves on). */
  markRead(line: DialogueLine): void {
    if (this.read.has(line.id)) return;
    this.read.add(line.id);
    // Saved in batches: one settings write per 10 lines (and when the box closes).
    if (this.read.size % 10 === 0) this.saveRead();
  }

  /** Saves the read-line set now. */
  saveRead(): void {
    this.options.game?.settings.set(this.readKey, [...this.read]);
  }

  private pushBacklog(entry: BacklogEntry): void {
    this.view.backlog.push(entry);
    const max = this.options.backlogSize ?? 200;
    if (this.view.backlog.length > max) this.view.backlog.splice(0, this.view.backlog.length - max);
  }

  private applyTag(tag: DialogueTag, line: DialogueLine | null): void {
    const game = this.options.game;
    const words = tag.value.split(/\s+/).filter(Boolean);
    switch (tag.name) {
      case 'portrait': {
        const [character, expression = 'neutral', position] = words;
        if (!character) break;
        if (character === 'none') {
          this.view.portraits.splice(0);
          break;
        }
        this.setPortrait(character, expression, position);
        break;
      }
      case 'expression': {
        const character = line?.speaker?.toLowerCase();
        const current = this.view.portraits.find((p) => p.character === character);
        if (current && words[0]) current.expression = words[0];
        break;
      }
      case 'hide': {
        const index = this.view.portraits.findIndex((p) => p.character === words[0]);
        if (index >= 0) this.view.portraits.splice(index, 1);
        break;
      }
      case 'clear':
        this.view.portraits.splice(0);
        break;
      case 'voice':
        if (game && tag.value) this.voice = safePlay(game, tag.value, 'voice');
        break;
      case 'sfx':
        if (game && tag.value) safePlay(game, tag.value, 'sfx');
        break;
      case 'music':
        if (!game) break;
        if (tag.value === 'stop' || !tag.value) game.audio.stopMusic({ fade: 600 });
        else {
          try {
            game.audio.music(tag.value, { fade: 600 });
          } catch (error) {
            console.warn(`[blacklight] Ink tag "music: ${tag.value}":`, error);
          }
        }
        break;
    }
    this.events.emit('tag', { tag, line });
  }

  private setPortrait(character: string, expression: string, position?: string): void {
    const existing = this.view.portraits.find((p) => p.character === character);
    const where = (['left', 'center', 'right'] as const).find((p) => p === position);
    if (existing) {
      existing.expression = expression;
      if (where) existing.position = where;
      return;
    }
    const taken = new Set(this.view.portraits.map((p) => p.position));
    const free = (['left', 'right', 'center'] as const).find((p) => !taken.has(p)) ?? 'center';
    this.view.portraits.push({ character, expression, position: where ?? free });
  }

  /** Replays the voice of a backlog entry. */
  replayVoice(entry: BacklogEntry): void {
    if (!entry.voice || !this.options.game) return;
    this.voice?.stop();
    this.voice = safePlay(this.options.game, entry.voice, 'voice');
  }

  /** The voice line playing, if any. */
  get playingVoice(): SoundHandle | undefined {
    return this.voice;
  }

  /** JSON state for saves (Ink variables and position, the shown line, backlog, portraits). */
  state(): DialogueState {
    return JSON.parse(
      JSON.stringify({
        version: 1,
        ink: this.story.state.toJson(),
        line: this.view.line,
        choices: this.view.choices,
        backlog: this.view.backlog,
        portraits: this.view.portraits,
        ended: this.view.ended,
        locale: this.locale,
      }),
    ) as DialogueState;
  }

  /**
   * Restores a state from {@link state}: the same line is shown again, with its choices,
   * portraits and backlog. Tags of the restored line are not replayed (no sound on load).
   *
   * @throws Error when the state is not a dialogue state or does not match the story.
   */
  restore(state: DialogueState): void {
    if (!state || state.version !== 1 || typeof state.ink !== 'string') {
      throw new Error('Not a dialogue state: pass the object returned by dialogue.state().');
    }
    try {
      this.story.state.LoadJson(state.ink);
    } catch (error) {
      throw new Error(
        `The saved dialogue does not match this story (${error instanceof Error ? error.message : String(error)}). Was the .ink file changed since the save?`,
        { cause: error },
      );
    }
    this.view.line = state.line;
    this.view.choices = state.choices ?? [];
    this.view.backlog = state.backlog ?? [];
    this.view.portraits = state.portraits ?? [];
    this.view.ended = !!state.ended;
    if (state.line) this.events.emit('line', { line: state.line });
    else if (this.view.choices.length > 0)
      this.events.emit('choices', { choices: this.view.choices });
  }

  /**
   * Switches to the story of another language (when `story` maps languages to stories). Variables
   * and position carry over, so the translations must keep the same knots, stitches and choices.
   * The current line stays in the old language until the next one.
   */
  setLocale(locale: string): void {
    if (Object.keys(this.stories).length < 2 || locale === this.locale) {
      this.locale = locale;
      return;
    }
    const before = this.pick();
    this.locale = locale;
    const after = this.pick();
    if (after === before) return;
    const ink = this.story.state.toJson();
    this.story = markRaw(this.load(after));
    this.story.state.LoadJson(ink);
  }
}

function isLanguageMap(value: unknown): value is Record<string, InkStory> {
  if (typeof value !== 'object' || value === null || 'inkVersion' in value) return false;
  return Object.keys(value).every((key) => /^[a-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(key));
}

/** Line-level tags that wrap the text in rich-text markup: `# color: danger`, `# effect: shake`. */
function wrapByTags(text: string, tags: DialogueTag[]): string {
  let out = text;
  for (const tag of tags) {
    if (tag.name === 'color' && tag.value) out = `<color=${tag.value}>${out}</color>`;
    if (tag.name === 'size' && tag.value) out = `<size=${tag.value}>${out}</size>`;
    if (tag.name === 'speed' && tag.value) out = `<speed=${tag.value}>${out}</speed>`;
    if (tag.name === 'effect' && /^(shake|wave)$/.test(tag.value))
      out = `<${tag.value}>${out}</${tag.value}>`;
  }
  return out;
}

function safePlay(game: Game, key: string, bus: 'voice' | 'sfx'): SoundHandle | undefined {
  try {
    return game.audio.play(key, { bus });
  } catch (error) {
    console.warn(`[blacklight] Ink tag "${bus === 'voice' ? 'voice' : 'sfx'}: ${key}":`, error);
    return undefined;
  }
}

/** Length of a line without tags, for auto-mode timing. */
export function lineLength(line: DialogueLine): number {
  return plainText(line.text).length;
}
