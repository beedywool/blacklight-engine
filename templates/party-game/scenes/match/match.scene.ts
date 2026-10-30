import { Graphics, Scene } from '@blacklight/core';
import { miniGame } from '../../party/catalog';
import type { Contestant, MiniGame, MiniGameParams } from '../../party/minigame';
import { PLAY } from '../../party/rules';
import { contestantsOf, recordMatch, type MatchSetup } from '../../party/session';

/** Where the mini-game runs, right of the player banners. */
export const PLAY_RECT = { x: 400, y: 40, width: PLAY.width, height: PLAY.height };

/**
 * The shell around a mini-game: player banners and scores, the pause menu, the mini-game hosted
 * as a sub-scene, and the end panel (results, replay, back).
 */
export default class Match extends Scene<MatchSetup> {
  setup!: MatchSetup;
  contestants: Contestant[] = [];
  minigame: MiniGame | undefined;
  ended = false;

  override async create(setup: MatchSetup): Promise<void> {
    this.setup = setup;
    this.contestants = contestantsOf(setup);
    const back = this.spawn(Graphics, { layer: 'hud', zIndex: -1 });
    back.draw.rect(0, 0, 1920, 1080).fill(0x0b0b0e);
    back.draw.poly([0, 0, 380, 0, 330, 1080, 0, 1080]).fill(0x16161c);
    back.draw
      .rect(PLAY_RECT.x - 6, PLAY_RECT.y - 6, PLAY_RECT.width + 12, PLAY_RECT.height + 12)
      .fill(0xffffff);
    this.ui.open('MatchHud', { match: this });
    const params: MiniGameParams = {
      players: this.contestants,
      settings: setup.settings,
      online: setup.online,
    };
    this.minigame = (await this.hostScene(setup.game, PLAY_RECT, params)) as unknown as MiniGame;
  }

  get title(): string {
    return miniGame(this.setup.game).title;
  }

  override update(): void {
    const minigame = this.minigame;
    if (!minigame) return;
    if (!this.ended && minigame.referee.finished) {
      this.ended = true;
      recordMatch(this.game, {
        setup: this.setup,
        contestants: this.contestants,
        scores: minigame.results(),
      });
      this.ui.push('MatchEnd', { match: this }, { closeOnBack: false });
      return;
    }
    if (this.ended) return;
    // Any local player can pause; online, the menu opens without stopping the match.
    if (this.game.input.joinedPlayers.some((p) => p.pressed('pause')))
      this.ui.push('MatchPause', { match: this });
  }
}
