// NET-04: lockstep for turn-based games.
import { describe, expect, it } from 'vitest';
import { LockstepSession, type Turn } from '../src/lockstep';
import { SimulatedNetwork } from '../src/testing';

const tick = 1000 / 60;

function setup(players: number, order: 'simultaneous' | 'alternate', loss = 0.1) {
  const network = new SimulatedNetwork({ latency: 70, jitter: 30, loss, duplicate: 0.05 });
  const sessions = network.matches({ players }).map((match) => {
    const totals = { sum: 0 };
    const session = new LockstepSession<{ card: number }>(match, {
      order,
      state: () => `sum=${totals.sum}`,
    });
    const turns: Turn<{ card: number }>[] = [];
    session.events.on('turn', (turn) => {
      turns.push(turn);
      for (const move of turn.moves) totals.sum += move?.card ?? 0;
    });
    return { session, turns, totals };
  });
  const run = (ticks: number, act: (frame: number) => void = () => {}) => {
    for (let f = 0; f < ticks; f++) {
      network.advance(tick);
      act(f);
      for (const s of sessions) s.session.poll();
    }
  };
  return { network, sessions, run };
}

describe('lockstep session', () => {
  it('completes simultaneous turns with every move, in the same order everywhere', () => {
    const { sessions, run } = setup(3, 'simultaneous');
    run(600, (f) => {
      sessions.forEach(({ session }, i) => {
        // Players think at different speeds.
        if ((f + i * 7) % (10 + i * 5) === 0 && session.canPlay())
          session.submit({ card: (f % 13) + i });
      });
    });
    const [first, ...others] = sessions;
    expect(first!.turns.length).toBeGreaterThan(10);
    for (const other of others) {
      const common = Math.min(other.turns.length, first!.turns.length);
      expect(other.turns.slice(0, common)).toEqual(first!.turns.slice(0, common));
    }
    for (const turn of first!.turns) expect(turn.moves.every((m) => m !== null)).toBe(true);
  });

  it('alternates turns between players and refuses moves out of turn', () => {
    const { sessions, run } = setup(2, 'alternate');
    expect(sessions[0]!.session.canPlay()).toBe(true);
    expect(sessions[1]!.session.canPlay()).toBe(false);
    expect(() => sessions[1]!.session.submit({ card: 1 })).toThrow(/not its turn/);
    sessions[0]!.session.submit({ card: 5 });
    expect(() => sessions[0]!.session.submit({ card: 6 })).toThrow(/turn 1|already|not its turn/);
    run(200, (f) => {
      for (const { session } of sessions)
        if (f % 9 === 0 && session.canPlay()) session.submit({ card: f });
    });
    const turns = sessions[0]!.turns;
    expect(turns.length).toBeGreaterThan(5);
    turns.forEach((turn) => {
      expect(turn.moves.filter((m) => m !== null)).toHaveLength(1);
      expect(turn.moves[turn.turn % 2]).not.toBeNull();
    });
    expect(sessions[1]!.turns.slice(0, turns.length)).toEqual(
      turns.slice(0, sessions[1]!.turns.length),
    );
  });

  it('reports a desync when the states after a turn differ', () => {
    const { sessions, run } = setup(2, 'simultaneous', 0);
    const desyncs: number[] = [];
    sessions[0]!.session.events.on('desync', (d) => desyncs.push(d.turn));
    sessions[1]!.totals.sum = 1000;
    run(120, (f) => {
      for (const { session } of sessions)
        if (f % 10 === 0 && session.canPlay()) session.submit({ card: 1 });
    });
    expect(desyncs[0]).toBe(0);
  });

  it('skips players that left', () => {
    const { network, sessions, run } = setup(3, 'simultaneous', 0);
    const leaves: number[] = [];
    sessions[0]!.session.events.on('leave', (e) => leaves.push(...e.players));
    run(100, (f) => {
      if (f === 40) network.disconnect(3);
      for (const { session } of sessions.slice(0, f >= 40 ? 2 : 3))
        if (f % 10 === 0 && session.canPlay()) session.submit({ card: 2 });
    });
    expect(leaves).toEqual([3]);
    const last = sessions[0]!.turns.at(-1)!;
    expect(last.moves[2]).toBeNull();
    expect(sessions[0]!.turns).toEqual(sessions[1]!.turns.slice(0, sessions[0]!.turns.length));
    expect(sessions[0]!.session.waitingFor()).not.toContain(3);
  });

  it('refuses moves of players that are not local', () => {
    const network = new SimulatedNetwork();
    const [match] = network.matches({ players: 2 });
    const session = new LockstepSession(match!);
    expect(() => session.submit('x', 2)).toThrow(/not played on this machine/);
  });
});
