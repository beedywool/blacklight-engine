// NET-02 rollback and NET-05 harness on a small deterministic simulation.
import { describe, expect, it } from 'vitest';
import type { DesyncReport } from '../src/rollback';
import { SimulatedNetwork, simulateMatch } from '../src/testing';
import { counterInstance } from './helpers';

const tick = 1000 / 60;

describe('rollback session', () => {
  it('keeps 2 to 8 players in sync under latency, jitter and loss', async () => {
    for (const players of [2, 3, 8]) {
      const result = await simulateMatch({
        players,
        frames: 1200,
        network: { latency: 80, jitter: 40, loss: 0.05, duplicate: 0.02 },
        create: (match) => counterInstance(match),
      });
      expect(result.desyncs).toEqual([]);
      expect(result.agreedFrames).toBeGreaterThan(30);
      expect(result.network.lost).toBeGreaterThan(0);
      for (const stats of result.stats) {
        expect(stats.rollbacks).toBeGreaterThan(0);
        expect(stats.deepestRollback).toBeLessThanOrEqual(8);
      }
    }
  });

  it('rolls back at most maxRollback steps and waits beyond', async () => {
    const result = await simulateMatch({
      players: 2,
      frames: 900,
      network: { latency: 300 },
      create: (match) => counterInstance(match, { delay: 0, maxRollback: 8 }),
    });
    expect(result.desyncs).toEqual([]);
    for (const stats of result.stats) {
      expect(stats.deepestRollback).toBe(8);
      expect(stats.stalls).toBeGreaterThan(0);
    }
    expect(result.frames[0]).toBeLessThan(900);
  });

  it('hides latency below the input delay without any rollback', async () => {
    const result = await simulateMatch({
      players: 4,
      frames: 600,
      network: { latency: 30 },
      create: (match) => counterInstance(match, { delay: 3 }),
    });
    expect(result.desyncs).toEqual([]);
    for (const stats of result.stats) expect(stats.rollbacks).toBe(0);
  });

  it('changes the input delay during a match', async () => {
    const result = await simulateMatch({
      players: 3,
      frames: 900,
      network: { latency: 50, jitter: 20, loss: 0.02 },
      create: (match) => counterInstance(match, { delay: 1 }),
      onTick: (frame, instances) => {
        const session = instances[frame % 3]!.session as unknown as { delay: number };
        if (frame === 200) session.delay = 5;
        if (frame === 500) session.delay = 0;
      },
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(20);
  });

  it('detects a desync and reports what differs', async () => {
    const network = new SimulatedNetwork({ latency: 40 });
    const instances = network.matches({ players: 2 }).map((match) => counterInstance(match));
    instances[1]!.game.cheatFrom = 100;
    const reports: DesyncReport[] = [];
    const desyncs: number[] = [];
    instances[0]!.session.events.on('desync', (d) => desyncs.push(d.frame));
    instances[0]!.session.events.on('desyncReport', (r) => reports.push(r));
    for (let f = 0; f < 300; f++) {
      network.advance(tick);
      for (const i of instances) i.tick();
    }
    expect(desyncs[0]).toBe(120);
    expect(reports[0]).toMatchObject({ frame: 120, member: 2 });
    expect(reports[0]!.differences.map((d) => d.path)).toEqual(['values[1]']);
  });

  it('lets spectators follow the confirmed steps', async () => {
    const result = await simulateMatch({
      players: 2,
      spectators: 2,
      frames: 900,
      network: { latency: 60, jitter: 20, loss: 0.03 },
      create: (match) => counterInstance(match),
    });
    expect(result.desyncs).toEqual([]);
    expect(result.agreedFrames).toBeGreaterThan(20);
    expect(result.stats[2]!.rollbacks).toBe(0);
  });

  it('syncs a spectator that joins during the match', () => {
    const network = new SimulatedNetwork({ latency: 50, jitter: 10, loss: 0.02 });
    const matches = network.matches({ players: 2 });
    const players = matches.map((match) => counterInstance(match));
    const run = (frames: number, all: { tick: () => void }[]) => {
      for (let f = 0; f < frames; f++) {
        network.advance(tick);
        for (const i of all) i.tick();
      }
    };
    run(400, players);
    const late = counterInstance({
      ...matches[0]!,
      self: 3,
      local: [],
      late: true,
      transport: network.connect(3),
    });
    const synced: number[] = [];
    late.session.events.on('synced', ({ frame }) => synced.push(frame));
    run(600, [...players, late]);
    expect(synced).toHaveLength(1);
    expect(synced[0]!).toBeGreaterThan(390);
    const mine = [...late.session.checksums];
    expect(mine.length).toBeGreaterThan(10);
    for (const [frame, hash] of mine) expect(players[0]!.session.checksums.get(frame)).toBe(hash);
  });

  it('gives a player that left neutral input on every machine', () => {
    const network = new SimulatedNetwork({ latency: 50 });
    const instances = network.matches({ players: 3 }).map((match) => counterInstance(match));
    const leaves: number[] = [];
    instances[0]!.session.events.on('leave', (e) => leaves.push(e.frame));
    for (let f = 0; f < 900; f++) {
      network.advance(tick);
      if (f === 300) network.disconnect(3);
      for (const i of f >= 300 ? instances.slice(0, 2) : instances) i.tick();
    }
    expect(leaves).toHaveLength(1);
    expect(instances[0]!.session.connected(3)).toBe(false);
    expect(instances[0]!.session.connected(3, leaves[0]! - 1)).toBe(true);
    const [a, b] = instances.map((i) => i.session.checksums);
    let compared = 0;
    for (const [frame, hash] of a!) {
      if (frame > 320 && b!.has(frame)) {
        expect(b!.get(frame)).toBe(hash);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(10);
    expect(instances[0]!.session.frame).toBeGreaterThan(850);
  });

  it('refuses matches without players numbered 1 to N', () => {
    const network = new SimulatedNetwork();
    const [match] = network.matches({ players: 2 });
    expect(() =>
      counterInstance({ ...match!, players: [{ number: 2, member: 1, name: 'x' }] }),
    ).toThrow(/numbered 1 to N/);
  });
});
