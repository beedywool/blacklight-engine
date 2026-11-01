<script setup lang="ts">
import { onUiStep } from '@blacklight/ui';
import { computed, shallowRef } from 'vue';
import type { MiniGame } from '../party/minigame';
import { GO_STEPS, INTRO_STEPS } from '../party/rules';
import type { Phase } from '@objects/referee/referee.object';

// Shared by every mini-game: the title banner slides in while the controls are locked, "GO!"
// zooms out when they unlock, the mini-game's notice (countdowns, turns) shows during play and
// "FINISH!" at the end. Every animation is computed from the referee's step counter, not played
// by CSS on the wall clock: a paused game freezes the banner too, and a given step always looks
// the same (screenshots, replays).
const props = defineProps<{ scene: MiniGame }>();
const phase = shallowRef<Phase>('intro');
const clock = shallowRef(0);
const notice = shallowRef<string | undefined>();

onUiStep(() => {
  const referee = props.scene.referee;
  if (!referee) return;
  phase.value = referee.phase;
  clock.value = referee.clock;
  notice.value = props.scene.notice();
});

const rect = computed(() => {
  const r = props.scene.hostRect ?? { x: 0, y: 0, width: 1920, height: 1080 };
  return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` };
});

/** Progress (0 to 1) of an animation that starts at step `start` and lasts `steps`. */
const progress = (start: number, steps: number) =>
  Math.min(1, Math.max(0, (clock.value - start) / steps));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t;
const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/** The band slides in (0.45 s), then out during the last 25 steps of the intro. */
const LEAVE_AT = INTRO_STEPS - 25;
const band = computed(() => {
  const x =
    clock.value < LEAVE_AT
      ? mix(-110, 0, easeOut(progress(0, 27)))
      : mix(0, 110, easeIn(progress(LEAVE_AT, 21)));
  return { transform: `skewY(-4deg) translateX(${x}%)` };
});
const title = computed(() => ({
  transform: `translateX(${mix(-30, 6, easeOut(progress(0, INTRO_STEPS)))}%)`,
}));
const go = computed(() => phase.value === 'play' && clock.value < GO_STEPS);
const goStyle = computed(() => {
  const t = progress(0, GO_STEPS);
  return {
    transform: `scale(${mix(3, 0.6, easeOut(t))})`,
    opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
  };
});
const finishStyle = computed(() => {
  // Overshoots a little before it settles.
  const t = progress(0, 24);
  const scale = mix(0.2, 1, 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2);
  return { transform: `scale(${scale}) rotate(${mix(-12, -4, easeOut(t))}deg)` };
});
</script>

<template>
  <div class="banner" :style="rect">
    <div v-if="phase === 'intro'" class="banner__band" :style="band">
      <span class="banner__title" :style="title">{{ scene.info.title }}</span>
      <span class="banner__hint">{{ scene.info.description }}</span>
    </div>
    <div v-if="go" class="banner__go" :style="goStyle">GO!</div>
    <div v-if="phase === 'play' && notice" class="banner__notice">{{ notice }}</div>
    <div v-if="phase === 'over'" class="banner__finish" :style="finishStyle">FINISH!</div>
  </div>
</template>

<style scoped>
.banner {
  position: absolute;
  pointer-events: none;
  overflow: hidden;
}
.banner__band {
  position: absolute;
  left: -10%;
  right: -10%;
  top: 38%;
  padding: 26px 0 22px;
  background: #111;
  border-block: 8px solid var(--bl-color-primary);
  transform: skewY(-4deg);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.banner__title {
  font: 400 120px/1 var(--bl-font-display);
  color: #fff;
  letter-spacing: 0.04em;
}
.banner__hint {
  margin-top: 10px;
  font: 30px var(--bl-font-body);
  color: #ddd;
}
.banner__go {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font: 400 260px/1 var(--bl-font-display);
  color: var(--bl-color-primary);
  -webkit-text-stroke: 10px #111;
  paint-order: stroke fill;
}
.banner__notice {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%) skewX(var(--bl-skew));
  padding: 8px 28px;
  background: #111;
  color: #fff;
  font: 40px var(--bl-font-display);
  white-space: nowrap;
}
.banner__finish {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font: 400 200px/1 var(--bl-font-display);
  color: #fff;
  -webkit-text-stroke: 10px #111;
  paint-order: stroke fill;
}
</style>
