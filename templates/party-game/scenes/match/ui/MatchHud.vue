<script setup lang="ts">
import { Counter, InputPrompt, onUiStep } from '@blacklight/ui';
import { shallowRef } from 'vue';
import SkinBadge from '@ui/SkinBadge.vue';
import type { ContestantStatus } from '../../../party/minigame';
import type Match from '../match.scene';

// Player banners on the left of the mini-game: skin, name, points, lives or role, power card.
const props = defineProps<{ match: Match }>();
const rows = shallowRef<(ContestantStatus & { player: number; name: string; skin: number })[]>([]);

onUiStep(() => {
  const minigame = props.match.minigame;
  if (!minigame?.referee) return;
  rows.value = props.match.contestants.map((c) => ({ ...c, ...minigame.status(c.player) }));
});
</script>

<template>
  <div class="hud">
    <div class="hud__title">{{ match.title }}</div>
    <div class="hud__rows">
      <div
        v-for="row in rows"
        :key="row.player"
        class="row"
        :class="{ 'row--out': row.out, 'row--shield': row.shield }"
        :data-player="row.player"
      >
        <SkinBadge class="row__skin" :skin="row.skin" :size="70" :dim="row.out" />
        <div class="row__text">
          <span class="row__name">{{ row.name }}</span>
          <span class="row__detail">{{ row.out ? 'OUT' : (row.detail ?? '') }}</span>
        </div>
        <span
          class="row__card"
          :class="{ 'row__card--used': !row.card }"
          title="Power card: shield"
        >
          <span>⛨</span>
        </span>
        <Counter class="row__score" :value="row.score" :duration="300" />
      </div>
    </div>
    <div class="hud__prompts">
      <InputPrompt action="card" label="CARD" :size="34" />
      <InputPrompt action="pause" label="PAUSE" :size="34" />
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 380px;
  color: #fff;
  pointer-events: none;
}
.hud__title {
  margin: 30px 0 0 24px;
  font: 400 44px/1 var(--bl-font-display);
  color: var(--bl-color-primary);
  transform: rotate(-3deg);
}
.hud__rows {
  margin: 26px 0 0 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: grid;
  grid-template-columns: 76px 1fr 40px 70px;
  align-items: center;
  gap: 8px;
  height: 92px;
  padding: 0 10px;
  background: #111;
  border-left: 8px solid var(--bl-color-primary);
  transform: skewX(var(--bl-skew));
}
.row--out {
  opacity: 0.5;
  border-left-color: #444;
}
.row--shield {
  box-shadow: 0 0 0 4px #7ad7ff;
}
.row__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.row__name {
  font: 30px/1.1 var(--bl-font-display);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row__detail {
  font: 20px var(--bl-font-body);
  color: #aaa;
}
.row__card {
  display: grid;
  place-items: center;
  width: 34px;
  height: 46px;
  background: #ffd60a;
  color: #111;
  border-radius: 4px;
  font-size: 24px;
  transform: rotate(8deg);
}
.row__card--used {
  visibility: hidden;
}
.row__score {
  font: 46px var(--bl-font-display);
  text-align: right;
}
.hud__prompts {
  position: absolute;
  left: 24px;
  bottom: 30px;
  display: flex;
  gap: 24px;
  font: 24px var(--bl-font-display);
}
</style>
