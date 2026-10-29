import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { useFx } from '../src/composables';
import { createFxFilter, FX_SHADERS, type FxFilter } from '../src/fx/filters';
import { snapshotSvg } from '../src/fx/snapshot';
import WorldAnchor from '../src/components/WorldAnchor.vue';
import { cueAt, parseVtt, subtitle, subtitleLines, videoSources } from '../src/video';
import { damageNumber, floatingTexts, floatText, visibleArea, worldToUi } from '../src/world';
import { installUi, settle, wait } from './helpers';

describe('FX layer (UI-11)', () => {
  it('builds every built-in effect', () => {
    for (const name of ['glitch', 'halftone', 'blur', 'chromatic', 'distort'] as const) {
      const filter = createFxFilter(name);
      filter.strength = 0.5;
      expect(filter.strength).toBe(0.5);
    }
    expect(Object.keys(FX_SHADERS)).toEqual(['glitch', 'halftone', 'chromatic', 'distort']);
    expect(() => createFxFilter('sepia' as never)).toThrow(/Unknown FX "sepia"/);
  });

  it('adds effects on the game world, fades them, animates time and removes them', async () => {
    const { game, runtime } = installUi();
    const glitch = runtime.fx.add('glitch', { strength: 0.8, fade: 30 });
    await settle();
    expect(game.world.filters).toEqual([glitch.filter]);
    expect(glitch.strength).toBe(0);
    await wait(10);
    game.events.emit('frame', { deltaMS: 16 });
    expect((glitch.filter as FxFilter).time).toBeCloseTo(0.016);
    await wait(40);
    game.events.emit('frame', { deltaMS: 16 });
    expect(glitch.strength).toBeCloseTo(0.8);
    const removed = glitch.remove(20);
    for (let i = 0; i < 5; i++) {
      await wait(10);
      game.events.emit('frame', { deltaMS: 16 });
    }
    await removed;
    expect(game.world.filters).toEqual([]);
    expect(runtime.fx.active).toHaveLength(0);
  });

  it('pulses an effect once (Ink `# fx: glitch`)', async () => {
    const { game, runtime } = installUi();
    const timer = setInterval(() => game.events.emit('frame', { deltaMS: 16 }), 5);
    await runtime.fx.pulse('chromatic', { duration: 60 });
    clearInterval(timer);
    expect(runtime.fx.active).toHaveLength(0);
  });

  it('keeps a screen effect for the life of the screen (useFx)', async () => {
    const { game, runtime } = installUi();
    const Blurred = defineComponent({
      setup() {
        useFx('blur', { strength: 0.6, fade: 0 });
        return () => h('div', 'paused');
      },
    });
    const handle = runtime.global.push(Blurred, {}, { enter: 'none', leave: 'none' });
    await settle();
    expect(runtime.fx.active).toHaveLength(1);
    expect((game.world.filters as unknown[]).length).toBe(1);
    handle.close();
    await settle();
    const timer = setInterval(() => game.events.emit('frame', { deltaMS: 16 }), 5);
    await wait(260);
    clearInterval(timer);
    expect(runtime.fx.active).toHaveLength(0);
  });

  it('distorts the picture during the distort scene transition', () => {
    const { game, runtime } = installUi();
    const transition = game.transitions.get('distort')!;
    const size = { width: 1920, height: 1080 };
    transition.draw(undefined as never, 0.8, size);
    expect(runtime.fx.active.map((f) => f.strength)).toEqual([0.8 * 1.6, 0.8 * 1.2]);
    expect(runtime.element.querySelector('.bl-cover')).not.toBeNull();
    transition.draw(undefined as never, 0.3, size);
    transition.draw(undefined as never, 0, size);
    expect(runtime.element.querySelector('.bl-cover')).toBeNull();
  });

  it('serializes a component to SVG for <PixiRender> (computed styles inline, visible copy)', async () => {
    const element = document.createElement('div');
    element.style.opacity = '0';
    element.innerHTML = '<b style="color: red">Glitched</b>';
    document.body.append(element);
    const { svg } = await snapshotSvg(element);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('Glitched');
    expect(svg).toMatch(/opacity: 1/);
  });
});

/** A world container standing for a game object: Pixi's own transform math. */
function object(x: number, y: number) {
  const world = new Container();
  const layer = new Container();
  const child = new Container();
  world.addChild(layer);
  layer.addChild(child);
  world.position.set(100, 50);
  world.scale.set(0.5);
  layer.position.set(-200, 0);
  child.position.set(x, y);
  return { world, child };
}

describe('world-anchored UI (UI-14)', () => {
  const viewport = { originX: 100, originY: 50, scale: 0.5, canvasWidth: 1160, canvasHeight: 640 };

  it('converts an object position to UI pixels through camera and layers', () => {
    const { world, child } = object(600, 300);
    const game = { world, viewport, config: { resolution: { width: 1920, height: 1080 } } };
    expect(worldToUi(game as never, child)).toEqual({ x: 400, y: 300, onScreen: true });
    expect(worldToUi(game as never, child, { offset: { x: 0, y: -80 } }).y).toBe(220);
    child.position.set(5000, 300);
    expect(worldToUi(game as never, child).onScreen).toBe(false);
    expect(visibleArea(game as never)).toEqual({ x: -200, y: -100, width: 2320, height: 1280 });
  });

  it('WorldAnchor follows its target and hides off-screen', async () => {
    const { game, runtime } = installUi();
    const { world, child } = object(600, 300);
    Object.assign(game, { world, viewport });
    const Tag = defineComponent({
      setup: () => () =>
        h(WorldAnchor, { target: child, offset: { x: 0, y: -40 } }, () => h('span', 'Mira')),
    });
    runtime.global.open(Tag, {}, { enter: 'none' });
    await settle();
    const anchor = runtime.element.querySelector<HTMLElement>('.bl-world-anchor')!;
    expect(anchor.style.transform).toContain('translate(400px, 260px)');
    expect(anchor.dataset.offscreen).toBeUndefined();
    child.position.set(-3000, 300);
    game.events.emit('frame', { deltaMS: 16 });
    await settle();
    expect(anchor.dataset.offscreen).toBe('true');
    expect(anchor.style.visibility).toBe('hidden');
  });

  it('floats damage numbers above a target and removes them', async () => {
    const { game, runtime } = installUi();
    const { world, child } = object(600, 300);
    Object.assign(game, { world, viewport });
    floatText(
      game,
      {
        scene: { camera: { toScreen: (p: { x: number; y: number }) => p } } as never,
        x: 10,
        y: 20,
      },
      'MISS',
      { duration: 60 },
    );
    damageNumber(game, child, 42, { critical: true, duration: 60 });
    await settle();
    const floats = runtime.element.querySelectorAll<HTMLElement>('.bl-float');
    expect([...floats].map((f) => f.textContent)).toEqual(['MISS', '42']);
    expect(floats[1]!.classList.contains('bl-float--critical')).toBe(true);
    await wait(80);
    expect(floatingTexts).toHaveLength(0);
  });
});

describe('video (UI-19)', () => {
  it('parses WebVTT cues', () => {
    const cues = parseVtt(
      'WEBVTT\n\n1\n00:00:00.500 --> 00:00:02.000 align:start\n<v Mira>Hello</v>\n\n00:02.000 --> 00:03.500\nSecond\nline\n',
    );
    expect(cues).toEqual([
      { start: 0.5, end: 2, text: 'Mira: Hello' },
      { start: 2, end: 3.5, text: 'Second\nline' },
    ]);
    expect(cueAt(cues, 1)).toBe('Mira: Hello');
    expect(cueAt(cues, 2.5)).toBe('Second\nline');
    expect(cueAt(cues, 9)).toBe('');
  });

  it('lists WebM (alpha) before MP4 except on Apple WebKit', () => {
    const { game } = installUi({ 'assets/video/intro.mp4': '', 'assets/video/intro.webm': '' });
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    agent.mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    );
    expect(videoSources(game, 'intro').map((s) => s.type)).toEqual(['video/webm', 'video/mp4']);
    agent.mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(videoSources(game, 'intro').map((s) => s.type)).toEqual(['video/mp4', 'video/webm']);
    agent.mockRestore();
    expect(videoSources(game, 'https://cdn.example/x.webm')).toEqual([
      { src: 'https://cdn.example/x.webm', type: 'video/webm' },
    ]);
  });

  it('shows global subtitles until removed', async () => {
    const { runtime } = installUi();
    const remove = subtitle('Bravo team, move in.', { speaker: 'Radio' });
    await settle();
    expect(runtime.element.querySelector('.bl-subtitles--global')?.textContent).toBe(
      'Radio: Bravo team, move in.',
    );
    remove();
    expect(subtitleLines).toHaveLength(0);
  });
});
