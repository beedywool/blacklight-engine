// @blacklight-deterministic
import { Container } from '@blacklight/core';
import { INTRO_STEPS, OUTRO_STEPS, SECOND, SHIELD_STEPS } from '../../party/rules';

/** `intro`: title banner, controls locked. `play`: the mini-game runs. `over`: "FINISH!". */
export type Phase = 'intro' | 'play' | 'over';

/**
 * The state every mini-game shares: phase, scores, who is out, power cards and shields. Scene
 * fields are not part of snapshots, so mini-games keep their match state on their referee (a
 * subclass of this one): rollback restores it with everything else.
 */
export default class Referee extends Container {
  static override hitbox = 'none' as const;

  phase: Phase = 'intro';
  /** Steps since the phase started. */
  clock = 0;
  /** Player numbers, in banner order. */
  players: number[] = [];
  /** Points of this mini-game, by index in `players`. */
  scores: number[] = [];
  out: boolean[] = [];
  /** Power card still in hand. */
  cards: boolean[] = [];
  /** Steps of shield left. */
  shields: number[] = [];

  /** Sets the players up; call once after spawning. */
  begin(players: number[]): void {
    this.players = [...players];
    this.scores = players.map(() => 0);
    this.out = players.map(() => false);
    this.cards = players.map(() => true);
    this.shields = players.map(() => 0);
  }

  override update(): void {
    this.clock++;
    for (let i = 0; i < this.shields.length; i++) if (this.shields[i]! > 0) this.shields[i]!--;
    if (this.phase === 'intro' && this.clock >= INTRO_STEPS) {
      this.phase = 'play';
      this.clock = 0;
      this.scene.audio.play('go');
    }
    if (this.phase !== 'play') return;
    this.players.forEach((player, i) => {
      if (!this.cards[i] || this.out[i] || !this.canUseCard(player)) return;
      if (!this.game.input.player(player).pressed('card')) return;
      this.cards[i] = false;
      this.shields[i] = SHIELD_STEPS;
      this.scene.audio.play('shield');
    });
    this.rules();
  }

  /** The mini-game's own rules, every step of play (after the cards). */
  protected rules(): void {}

  /** Whether a player may play the card now (the seeker of hide and seek may not). */
  canUseCard(_player: number): boolean {
    return true;
  }

  /** Index of a player in the arrays. */
  index(player: number): number {
    return this.players.indexOf(player);
  }

  get playing(): boolean {
    return this.phase === 'play';
  }

  /** Steps of play so far (0 before "GO!"). */
  get elapsed(): number {
    return this.phase === 'play' ? this.clock : 0;
  }

  /** `true` on the last step of each second of play. */
  get secondElapsed(): boolean {
    return this.phase === 'play' && this.clock > 0 && this.clock % SECOND === 0;
  }

  /** The mini-game is over and "FINISH!" has been shown. */
  get finished(): boolean {
    return this.phase === 'over' && this.clock >= OUTRO_STEPS;
  }

  shielded(player: number): boolean {
    return (this.shields[this.index(player)] ?? 0) > 0;
  }

  isOut(player: number): boolean {
    return this.out[this.index(player)] ?? true;
  }

  score(player: number, points: number): void {
    const i = this.index(player);
    if (i >= 0) this.scores[i]! += points;
  }

  /** Every player still in gets `points`. */
  scoreStanding(points: number): void {
    this.players.forEach((_, i) => {
      if (!this.out[i]) this.scores[i]! += points;
    });
  }

  knockOut(player: number): void {
    const i = this.index(player);
    if (i < 0 || this.out[i]) return;
    this.out[i] = true;
    this.shields[i] = 0;
    this.scene.audio.play('out');
  }

  /** Players still in. */
  get standing(): number[] {
    return this.players.filter((_, i) => !this.out[i]);
  }

  finish(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.clock = 0;
    this.scene.audio.play('finish');
  }
}
