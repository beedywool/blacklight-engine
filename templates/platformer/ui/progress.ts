// State shared by the level and its screens. Vue's `reactive` makes the HUD follow it.
import { reactive } from 'vue';

/** The current run: coins, hits, checkpoint and whether the goal was reached. */
export const progress = reactive({
  coins: 0,
  total: 0,
  hits: 0,
  checkpoint: false,
  cleared: false,
});

/** Starts a new run of a level holding `total` coins. */
export function resetProgress(total: number): void {
  Object.assign(progress, { coins: 0, total, hits: 0, checkpoint: false, cleared: false });
}
