import { RollbackSession, type RollbackGame, type RollbackOptions } from '../src/rollback';
import type { OnlineMatch } from '../src/transport';

export interface CounterState {
  values: number[];
  presses: number[];
}

/**
 * A tiny deterministic simulation: every input byte and every press changes the state, so any
 * wrong or missing input shows in the checksums.
 */
export class CounterGame implements RollbackGame<CounterState> {
  state: CounterState;
  /** Breaks determinism on purpose from this step on (desync tests). */
  cheatFrom = Infinity;

  constructor(players: number) {
    this.state = { values: Array(players).fill(0), presses: Array(players).fill(0) };
  }

  save(): CounterState {
    return { values: [...this.state.values], presses: [...this.state.presses] };
  }

  load(state: CounterState): void {
    this.state = { values: [...state.values], presses: [...state.presses] };
  }

  step(inputs: readonly Uint8Array[], previous: readonly Uint8Array[], frame: number): void {
    inputs.forEach((input, i) => {
      const value = input[0]!;
      this.state.values[i] = (this.state.values[i]! * 31 + value + 1) % 1_000_003;
      if ((value & 1) === 1 && (previous[i]![0]! & 1) === 0) this.state.presses[i]!++;
    });
    if (frame >= this.cheatFrom) this.state.values[1]! += 1;
  }

  serialize(state: CounterState): string {
    return JSON.stringify(state);
  }

  deserialize(text: string): CounterState {
    return JSON.parse(text) as CounterState;
  }
}

/** Input of a bot: changes every few steps, differently per player. */
export function bot(player: number, frame: number): Uint8Array {
  const segment = Math.floor(frame / (7 + player));
  return new Uint8Array([(segment * 37 + player * 11) % 256]);
}

export function counterInstance(
  match: OnlineMatch,
  options: Partial<RollbackOptions> = {},
): { game: CounterGame; session: RollbackSession<CounterState>; tick: () => void } {
  const game = new CounterGame(match.players.length);
  const session = new RollbackSession(match, game, { inputSize: 1, sample: bot, ...options });
  return { game, session, tick: () => void session.tick() };
}
