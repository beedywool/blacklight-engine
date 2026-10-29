// NET-02 on engine scenes: inputs reach input.player(n), snapshots are restored on rollback,
// local devices and the UI keep their own input, replays are silent.
import { GameObject, Scene } from '@blacklight/core';
import { describe, expect, it } from 'vitest';
import { checksum, diffStates, stableStringify } from '../src/checksum';
import { InputCodec } from '../src/codec';
import { rollback, type SceneRollback } from '../src/scene-rollback';
import { headlessGame, headlessScene, SimulatedNetwork, simulateMatch } from '../src/testing';
import type { OnlineMatch } from '../src/transport';

const INPUTS = new InputCodec({ buttons: ['right', 'action'], analog: ['left'] });

class Runner extends GameObject {
  static override hitbox = { type: 'circle' as const, radius: 4 };
  jumps = 0;
  override update(): void {
    this.x += this.input.value('right') * 2 - this.input.value('left');
    if (this.input.pressed('action')) {
      this.jumps++;
      this.scene.audio.play('jump');
    }
  }
}

class Race extends Scene<{ match: OnlineMatch; sample?: (p: number, f: number) => Uint8Array }> {
  net!: SceneRollback;
  override create({
    match,
    sample,
  }: {
    match: OnlineMatch;
    sample?: (p: number, f: number) => Uint8Array;
  }) {
    this.net = rollback(this, match, { inputs: INPUTS, sample });
    for (const p of match.players) this.spawn(Runner, { x: 0, y: p.number * 10, player: p.number });
  }
}

function bot(player: number, frame: number): Uint8Array {
  const phase = Math.floor(frame / (5 + player)) % 4;
  return INPUTS.encode({ right: phase > 0, action: phase === 2, left: phase === 3 ? 0.5 : 0 });
}

describe('rollback on a scene', () => {
  it('feeds network inputs to input.player(n) and stays in sync', async () => {
    const result = await simulateMatch({
      players: 3,
      frames: 900,
      network: { latency: 90, jitter: 30, loss: 0.03 },
      create: async (match) => {
        const game = headlessGame();
        const scene = await headlessScene(Race, 'race', { match, sample: bot }, game);
        return {
          tick: () => {
            game.input.update();
            scene.step(game.time.dt);
          },
          session: scene.net.session,
        };
      },
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(20);
    expect(result.stats.every((s) => s.rollbacks > 0)).toBe(true);
  });

  it('reads local devices, keeps them for the UI and plays sounds once', async () => {
    const network = new SimulatedNetwork({ latency: 100 });
    const [mine, theirs] = network.matches({ players: 2, seed: 'race' });
    const game = headlessGame();
    const played: string[] = [];
    game.audio.play = ((key: string) => {
      played.push(key);
      return { key, ended: Promise.resolve(), stop() {}, setVolume() {}, setPosition() {} };
    }) as typeof game.audio.play;
    const scene = await headlessScene(Race, 'race', { match: mine }, game);
    const other = await headlessScene(Race, 'race', { match: theirs, sample: bot });
    const local = game.input.player(1);
    const runner = scene.findAll(Runner).find((r) => r.player === 1)!;
    for (let f = 0; f < 240; f++) {
      network.advance(1000 / 60);
      if (f === 10) game.input.keyDown('KeyX');
      if (f === 12) game.input.keyUp('KeyX');
      if (f >= 20 && f < 80) game.input.keyDown('ArrowRight');
      if (f === 80) game.input.keyUp('ArrowRight');
      // A modal screen blocks game input on this machine only; the simulation goes on.
      if (f === 100) game.input.blocked = true;
      game.input.update();
      scene.step(game.time.dt);
      other.input.update();
      other.step(other.game.time.dt);
      // Between steps the local player's state is the devices', not the network's.
      if (f === 40) expect(local.held('right')).toBe(true);
    }
    expect(runner.jumps).toBe(1);
    expect(runner.x).toBe(120);
    expect(played.filter((k) => k === 'jump').length).toBe(1);
    expect(scene.net.stats.rollbacks).toBeGreaterThan(0);
    const otherRunner = other.findAll(Runner).find((r) => r.player === 1)!;
    expect(otherRunner.x).toBe(120);
    const remote = (s: Scene<never>) => s.findAll(Runner).find((r) => r.player === 2)!;
    expect(game.input.blocked).toBe(true);
    expect(remote(scene as never).x).toBeGreaterThan(100);
    expect(scene.net.session.checksums.size).toBeGreaterThan(3);
    for (const [frame, hash] of scene.net.session.checksums)
      if (other.net.session.checksums.has(frame))
        expect(other.net.session.checksums.get(frame)).toBe(hash);
    expect(scene.net.frame).toBeGreaterThan(200);
    expect(scene.net.connected(2)).toBe(true);
    scene.net.delay = 4.4;
    expect(scene.net.delay).toBe(4);
  });

  it('seeds the scene random generator with the match seed', async () => {
    const network = new SimulatedNetwork();
    const [a, b] = network.matches({ players: 2, seed: 'same' });
    const first = await headlessScene(Race, 'race', { match: a });
    const second = await headlessScene(Race, 'race', { match: b });
    expect(first.random.next()).toBe(second.random.next());
  });

  it('gives the scene its own step back when it ends', async () => {
    const network = new SimulatedNetwork();
    const [a] = network.matches({ players: 1 });
    const scene = await headlessScene(Race, 'race', { match: a });
    expect(Object.hasOwn(scene, 'step')).toBe(true);
    scene.net.dispose();
    expect(Object.hasOwn(scene, 'step')).toBe(false);
  });
});

describe('input codec', () => {
  it('packs buttons in bits and analog values in bytes', () => {
    const codec = new InputCodec({
      buttons: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      analog: ['x'],
    });
    expect(codec.size).toBe(3);
    const input = codec.encode({ a: true, i: true, x: 0.5 });
    expect([...input]).toEqual([1, 1, 128]);
    expect(codec.decode(input)).toMatchObject({ a: 1, b: 0, i: 1, x: 128 / 255 });
  });

  it('derives pressed and released from the previous step', () => {
    const codec = new InputCodec({ buttons: ['jump'] });
    const down = codec.encode({ jump: true });
    const up = codec.neutral();
    expect(codec.states(down, up).get('jump')).toEqual({
      value: 1,
      held: true,
      pressed: true,
      released: false,
    });
    expect(codec.states(down, down).get('jump')).toMatchObject({ pressed: false, held: true });
    expect(codec.states(up, down).get('jump')).toMatchObject({ released: true, held: false });
  });

  it('explains wrong layouts', () => {
    expect(() => new InputCodec({})).toThrow(/at least one action/);
    expect(() => new InputCodec({ buttons: ['a'], analog: ['a'] })).toThrow(/listed twice/);
  });
});

describe('checksums and reports', () => {
  it('hashes key order away and reports differences by object id', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
    const local = {
      steps: 4,
      objects: [
        { id: 1, core: { x: 1 } },
        { id: 2, core: { x: 5 } },
      ],
    };
    const remote = {
      steps: 4,
      objects: [
        { id: 2, core: { x: 6 } },
        { id: 3, core: { x: 0 } },
      ],
    };
    expect(diffStates(local, remote)).toEqual([
      { path: 'objects[id=1]', local: { id: 1, core: { x: 1 } }, remote: undefined },
      { path: 'objects[id=2].core.x', local: 5, remote: 6 },
      { path: 'objects[id=3]', local: undefined, remote: { id: 3, core: { x: 0 } } },
    ]);
  });
});
