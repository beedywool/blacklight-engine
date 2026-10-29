import { describe, expect, it } from 'vitest';
import { Timeline } from '../src/timeline';
import { applyTimeline } from '../src/timeline-json';
import { fakeGame } from './helpers';

describe('applyTimeline', () => {
  it('builds a timeline from its JSON steps', async () => {
    const game = fakeGame();
    const root = document.createElement('div');
    root.innerHTML = '<h1 class="title"></h1><li class="item"></li><li class="item"></li>';
    document.body.append(root);
    const timeline = applyTimeline(
      new Timeline(game),
      {
        steps: [
          { to: '.title', keyframes: { opacity: [0, 1] }, duration: 0.2 },
          { sound: 'ui-slash', at: '<' },
          { label: 'items' },
          { to: '.item', keyframes: { x: [40, 0] }, at: 'items+0.1', duration: 0.1 },
        ],
      },
      { root },
    );
    expect(timeline.labelTime('items')).toBeCloseTo(0.2);
    expect(timeline.duration).toBeCloseTo(0.4);
    timeline.speed = 100;
    await timeline.play();
    expect((game as unknown as { played: string[] }).played).toEqual(['ui-slash']);
  });

  it('explains malformed files', () => {
    expect(() => applyTimeline(new Timeline(undefined), {} as never)).toThrow(/\.timeline\.json/);
    expect(() => applyTimeline(new Timeline(undefined), { steps: [{ nope: 1 } as never] })).toThrow(
      /step 0 needs "to"/,
    );
  });
});
