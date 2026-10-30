<script setup lang="ts">
import { onUiStep } from '@blacklight/ui';
import { computed, shallowRef } from 'vue';
import type { MiniGame } from '../party/minigame';
import { GO_STEPS, INTRO_STEPS } from '../party/rules';
import type { Phase } from '@objects/referee/referee.object';

// Shared by every mini-game: the title banner slides in while the controls are locked, "GO!"
// zooms out when they unlock, the mini-game's notice (countdowns, turns) shows during play and
// "FINISH!" at the end. Everything follows the referee's step counter, so a paused game freezes
// the banner too.
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
const leaving = computed(() => phase.value === 'intro' && clock.value > INTRO_STEPS - 25);
const go = computed(() => phase.value === 'play' && clock.value < GO_STEPS);
</script>

<template>
  <div class="banner" :style="rect">
    <div
      v-if="phase === 'intro'"
      class="banner__band"
      :class="{ 'banner__band--leaving': leaving }"
    >
      <span class="banner__title">{{ scene.info.title }}</span>
      <span class="banner__hint">{{ scene.info.description }}</span>
    </div>
    <div v-if="go" class="banner__go">GO!</div>
    <div v-if="phase === 'play' && notice" class="banner__notice">{{ notice }}</div>
    <div v-if="phase === 'over'" class="banner__finish">FINISH!</div>
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
  animation: band-in 0.45s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.banner__band--leaving {
  animation: band-out 0.35s ease-in both;
}
.banner__title {
  font: 400 120px/1 var(--bl-font-display);
  color: #fff;
  letter-spacing: 0.04em;
  animation: title-slide 2.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
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
  animation: go 0.66s ease-out both;
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
  animation: finish 0.4s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
@keyframes band-in {
  from {
    transform: skewY(-4deg) translateX(-110%);
  }
}
@keyframes band-out {
  to {
    transform: skewY(-4deg) translateX(110%);
  }
}
@keyframes title-slide {
  from {
    transform: translateX(-30%);
  }
  to {
    transform: translateX(6%);
  }
}
@keyframes go {
  from {
    transform: scale(3);
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  to {
    transform: scale(0.6);
    opacity: 0;
  }
}
@keyframes finish {
  from {
    transform: scale(0.2) rotate(-12deg);
  }
  to {
    transform: rotate(-4deg);
  }
}
</style>
