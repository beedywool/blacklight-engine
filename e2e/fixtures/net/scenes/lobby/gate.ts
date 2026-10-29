// The phase 3f gate run, shared by Node (packages/net/test/gate.spec.ts, e2e/net.spec.ts) and the
// browsers (window.netGate in the lobby scene): the same seeded match must give the same
// checksums on V8 and JavaScriptCore.
import { DMath, Random } from '@blacklight/core';
import {
  headlessGame,
  headlessScene,
  simulateMatch,
  type MatchResult,
} from '@blacklight/net/testing';
import PushPushOnline from '../push-push-online/push-push-online.scene';
import { ARENA } from '../push-push-online/rules';

export interface GateOptions {
  players?: number;
  frames?: number;
  latency?: number;
  jitter?: number;
  loss?: number;
  delay?: number;
  seed?: string;
}

/** 4 bots, 150 ms one-way latency, 20 ms jitter, 2 % loss by default. */
export async function runGate(options: GateOptions = {}): Promise<MatchResult> {
  return simulateMatch({
    players: options.players ?? 4,
    frames: options.frames ?? 600,
    seed: options.seed ?? 'gate',
    network: {
      latency: options.latency ?? 150,
      jitter: options.jitter ?? 20,
      loss: options.loss ?? 0.02,
    },
    create: async (match) => {
      const game = headlessGame({ width: ARENA.width, height: ARENA.height });
      const scene = await headlessScene(
        PushPushOnline,
        'push-push-online',
        { match, bots: true, delay: options.delay ?? 3 },
        game,
      );
      return {
        tick: () => {
          game.input.update();
          scene.step(game.time.dt);
        },
        session: scene.net.session,
      };
    },
  });
}

/** Bits of many DMath results, hashed (FNV-1a): equal on every engine. */
export function mathFingerprint(): string {
  const random = new Random('fingerprint');
  const view = new DataView(new ArrayBuffer(8));
  let hash = 0x811c9dc5;
  for (let i = 0; i < 2000; i++) {
    const x = random.float(-1000, 1000);
    const y = random.float(-1000, 1000);
    for (const v of [
      DMath.sin(x),
      DMath.cos(x),
      DMath.tan(x),
      DMath.atan2(y, x),
      DMath.exp(x / 100),
      DMath.log(Math.abs(x)),
      DMath.pow(Math.abs(x) / 100, y / 500),
      DMath.hypot(x, y),
      DMath.asin(x / 1000),
      DMath.cbrt(x),
    ]) {
      view.setFloat64(0, v);
      for (let b = 0; b < 8; b++) hash = Math.imul(hash ^ view.getUint8(b), 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}
