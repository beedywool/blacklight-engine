import { Compiler } from 'inkjs/full';
import { afterEach, describe, expect, it } from 'vitest';
import { accessibility } from '../src/a11y';
import DialogueBox from '../src/components/DialogueBox.vue';
import { Dialogue, parseTag } from '../src/dialogue';
import Backlog from '../src/screens/Backlog.vue';
import { installUi, settle, wait } from './helpers';

const compile = (source: string) => {
  const compiler = new Compiler(source);
  try {
    return JSON.parse(compiler.Compile().ToJson() as string) as object;
  } catch (error) {
    throw new Error(compiler.errors.join('\n'), { cause: error });
  }
};

const STORY = compile(`VAR trust = 0
VAR player = "Aoi"
# bg: street
Mira: Hello, {player}. # portrait: mira happy left # voice: mira_01
The wind rises. # sfx: wind # effect: shake
Mira: Will you come? # expression: worried
* [Yes]
  ~ trust = trust + 1
  Mira: Thank you!
* {trust > 5} [Secret] Never shown.
* [No]
  Mira: Oh.
- # portrait: none
{trust > 0: Mira: Let's go. | Mira: Alone, then.}
-> END
`);

const STORY_JA = compile(`VAR trust = 0
VAR player = "Aoi"
# bg: street
ミラ: こんにちは、{player}。 # portrait: mira happy left # voice: mira_01
風が吹く。 # sfx: wind # effect: shake
ミラ: 来る？ # expression: worried
* [はい]
  ~ trust = trust + 1
  ミラ: ありがとう！
* {trust > 5} [秘密] 見えない。
* [いいえ]
  ミラ: そう。
- # portrait: none
{trust > 0: ミラ: 行こう。 | ミラ: じゃあ一人で。}
-> END
`);

afterEach(() => {
  accessibility.reducedMotion = 'system';
  accessibility.textSpeed = 45;
});

describe('Dialogue (UI-10)', () => {
  it('parses Ink tags', () => {
    expect(parseTag('portrait: mira happy left')).toEqual({
      name: 'portrait',
      value: 'mira happy left',
    });
    expect(parseTag('sfx door')).toEqual({ name: 'sfx', value: 'door' });
    expect(parseTag('clear')).toEqual({ name: 'clear', value: '' });
  });

  it('plays lines with speakers, portraits, sounds, rich-text tags and choices', () => {
    const { game } = installUi();
    const dialogue = new Dialogue(STORY, { game });
    const tags: string[] = [];
    dialogue.events.on('tag', ({ tag }) => tags.push(tag.name));
    dialogue.start();
    expect(tags).toContain('bg');
    expect(dialogue.line).toMatchObject({ speaker: 'Mira', text: 'Hello, Aoi.', voice: 'mira_01' });
    expect(dialogue.view.portraits).toEqual([
      { character: 'mira', expression: 'happy', position: 'left' },
    ]);
    expect(game.played).toContain('mira_01');

    dialogue.next();
    expect(dialogue.line).toMatchObject({
      speaker: undefined,
      text: '<shake>The wind rises.</shake>',
    });
    expect(game.played).toContain('wind');
    dialogue.next();
    expect(dialogue.view.portraits[0]!.expression).toBe('worried');

    expect(dialogue.next()).toBe(true);
    expect(dialogue.line).toBeNull();
    // Conditions: the "Secret" choice needs trust > 5.
    expect(dialogue.choices.map((c) => c.text)).toEqual(['Yes', 'No']);
    expect(dialogue.next()).toBe(false);
    dialogue.choose(dialogue.choices[0]!.index);
    expect(dialogue.line?.text).toBe('Thank you!');
    expect(dialogue.vars.trust).toBe(1);
    dialogue.next();
    expect(dialogue.view.portraits).toEqual([]);
    expect(dialogue.line?.text).toBe("Let's go.");
    expect(dialogue.next()).toBe(false);
    expect(dialogue.ended).toBe(true);
    expect(dialogue.view.backlog.map((b) => b.text)).toEqual([
      'Hello, Aoi.',
      '<shake>The wind rises.</shake>',
      'Will you come?',
      'Yes',
      'Thank you!',
      "Let's go.",
    ]);
    expect(() => dialogue.choose(9)).toThrow(/No choice 9/);
  });

  it('reads and writes variables that conditions see', () => {
    const dialogue = new Dialogue(STORY);
    dialogue.start(undefined, { player: 'Ren' });
    expect(dialogue.line?.text).toBe('Hello, Ren.');
    expect(dialogue.vars.player).toBe('Ren');
    dialogue.vars.trust = 10;
    for (let i = 0; i < 3; i++) dialogue.next();
    expect(dialogue.choices.map((c) => c.text)).toEqual(['Yes', 'Secret', 'No']);
  });

  it('saves and restores mid-dialogue as JSON', () => {
    const first = new Dialogue(STORY);
    first.start();
    first.next();
    first.next();
    first.next();
    first.choose(first.choices.at(-1)!.index);
    const state = JSON.parse(JSON.stringify(first.state()));
    expect(state.line.text).toBe('Oh.');

    const second = new Dialogue(STORY);
    second.restore(state);
    expect(second.line?.text).toBe('Oh.');
    expect(second.view.backlog).toHaveLength(5);
    second.next();
    expect(second.line?.text).toBe('Alone, then.');
    expect(() => second.restore({} as never)).toThrow(/Not a dialogue state/);
  });

  it('tracks read lines across playthroughs for skip mode', () => {
    const { game } = installUi();
    const first = new Dialogue(STORY, { game });
    first.start();
    first.markRead(first.line!);
    first.saveRead();
    const again = new Dialogue(STORY, { game });
    again.start();
    expect(again.isRead()).toBe(true);
    again.next();
    expect(again.isRead()).toBe(false);
  });

  it('switches the story language and keeps the position', () => {
    const dialogue = new Dialogue({ en: STORY, ja: STORY_JA }, { locale: 'en' });
    dialogue.start();
    dialogue.next();
    dialogue.setLocale('ja');
    dialogue.next();
    expect(dialogue.line).toMatchObject({ speaker: 'ミラ', text: '来る？' });
  });

  it('reports a broken story with a fix', () => {
    expect(() => new Dialogue('{"not":"ink"}')).toThrow(/Could not load the Ink story/);
  });
});

describe('DialogueBox and Backlog (UI-10)', () => {
  async function open(options: { reduced?: boolean } = {}) {
    const { game, runtime } = installUi({ 'assets/portraits/mira-happy.svg': '' });
    // After installing: the UI loads the saved accessibility options.
    if (options.reduced) accessibility.reducedMotion = 'on';
    const dialogue = new Dialogue(STORY, { game });
    dialogue.start();
    runtime.global.push(DialogueBox, { dialogue }, { enter: 'none', leave: 'none' });
    await settle();
    const box = () => runtime.element.querySelector<HTMLElement>('.bl-dialogue__box');
    return { game, runtime, dialogue, box };
  }

  it('shows the name plate and portrait, finishes typing, then advances on confirm', async () => {
    accessibility.textSpeed = 10;
    const { runtime, dialogue, box } = await open();
    expect(runtime.element.querySelector('.bl-dialogue__name')?.textContent?.trim()).toBe('Mira');
    const portrait = runtime.element.querySelector<HTMLImageElement>('.bl-dialogue__portrait');
    expect(portrait?.getAttribute('src')).toBe('/assets/portraits/mira-happy.svg');
    expect(portrait?.dataset.expression).toBe('happy');
    expect(box()!.querySelectorAll('.bl-rt-hidden')[0]?.textContent?.length).toBeGreaterThan(0);
    box()!.click();
    await settle();
    expect(box()!.querySelector('.bl-rt-hidden')?.textContent).toBe('');
    expect(dialogue.line?.text).toBe('Hello, Aoi.');
    box()!.click();
    await settle();
    expect(dialogue.line?.text).toContain('The wind rises.');
  });

  it('offers choices as focusable buttons and picks one', async () => {
    const { runtime, dialogue } = await open({ reduced: true });
    for (let i = 0; i < 3; i++) dialogue.next();
    await settle();
    const choices = runtime.element.querySelectorAll<HTMLElement>('.bl-dialogue__choice');
    expect([...choices].map((c) => c.textContent?.trim())).toEqual(['Yes', 'No']);
    expect(runtime.focus.current.value).toBe(choices[0]);
    choices[1]!.click();
    await settle();
    expect(dialogue.line?.text).toBe('Oh.');
  });

  it('auto mode advances by itself; skip mode stops at unread lines', async () => {
    const { runtime, dialogue } = await open({ reduced: true });
    const buttons = runtime.element.querySelectorAll<HTMLElement>('.bl-dialogue__quick button');
    buttons[0]!.click(); // AUTO
    await wait(950 + 30 * 12 + 100);
    expect(dialogue.line?.text).toContain('The wind rises.');
    buttons[0]!.click(); // AUTO off
    buttons[1]!.click(); // SKIP: the current line is unread, so skip stops at once
    await wait(150);
    await settle();
    expect(runtime.element.querySelector('.bl-dialogue')?.getAttribute('data-mode')).toBe('normal');
  });

  it('the backlog lists every line and choice', async () => {
    const { runtime, dialogue } = await open({ reduced: true });
    dialogue.next();
    runtime.global.push(Backlog, { dialogue }, { enter: 'none', leave: 'none' });
    await settle();
    const entries = runtime.element.querySelectorAll('.bl-backlog__entry');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.textContent).toContain('Mira');
    expect(entries[0]!.querySelector('.bl-backlog__voice')).not.toBeNull();
  });
});
