<script setup lang="ts">
import { Counter, MenuList, useGame, useTimeline } from '@blacklight/ui';
import { computed, onMounted } from 'vue';
import SkinBadge from '@ui/SkinBadge.vue';
import { miniGame } from '../../../party/catalog';
import { party, ranking } from '../../../party/session';

const game = useGame();
const last = party.last;
const online = !!last?.setup.online;
const rows = computed(() => (last ? ranking(last) : []));
/** Podium order on screen: second, first, third. */
const podium = computed(() =>
  [rows.value[1], rows.value[0], rows.value[2]].map((row, i) => ({ row, place: [2, 1, 3][i]! })),
);

const intro = useTimeline()
  .to('.results .step--1', { y: [400, 0] }, { duration: 0.4, ease: 'backOut' })
  .to('.results .step--2', { y: [400, 0] }, { at: 0.12, duration: 0.4, ease: 'backOut' })
  .to('.results .step--3', { y: [400, 0] }, { at: 0.24, duration: 0.4, ease: 'backOut' })
  .to('.results .line', { x: [80, 0], opacity: [0, 1] }, { at: 0.3, duration: 0.25 });
onMounted(() => void intro.play());

const items = online
  ? [{ label: 'ONLINE', value: 'online' }]
  : [
      { label: 'REPLAY', value: 'replay' },
      { label: 'GAMES', value: 'games' },
      { label: 'TITLE', value: 'title' },
    ];

function select(value: string) {
  if (value === 'replay' && last)
    void game.goto('match', { ...last.setup }, { transition: 'iris' });
  if (value === 'games') void game.goto('game-select', undefined, { transition: 'slash' });
  if (value === 'online') void game.goto('online', undefined, { transition: 'fade' });
  if (value === 'title') void game.goto('title', undefined, { transition: 'fade' });
}
</script>

<template>
  <div class="results">
    <h1 class="results__title">RESULTS</h1>
    <p v-if="last" class="results__game">{{ miniGame(last.setup.game).title }}</p>
    <div class="results__podium">
      <div v-for="{ row, place } in podium" :key="place" class="step" :class="`step--${place}`">
        <template v-if="row">
          <SkinBadge :skin="row.contestant.skin" :size="place === 1 ? 170 : 130" />
          <span class="step__name">{{ row.contestant.name }}</span>
          <div class="step__block">
            <span class="step__place">{{ row.rank }}</span>
            <span class="step__points">{{ row.points }} PTS</span>
          </div>
        </template>
      </div>
    </div>
    <div class="results__table">
      <div class="line line--head">
        <span>PLAYER</span><span>MATCH</span><span v-if="!online">PARTY</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.contestant.player"
        class="line"
        :data-player="row.contestant.player"
      >
        <span class="line__name">{{ row.rank }}. {{ row.contestant.name }}</span>
        <span>{{ row.points }}</span>
        <Counter v-if="!online" :value="party.totals.get(row.contestant.player) ?? 0" />
      </div>
    </div>
    <MenuList class="results__menu" :items="items" horizontal @select="select" />
  </div>
</template>

<style scoped>
.results {
  position: absolute;
  inset: 0;
  color: #fff;
}
.results__title {
  position: absolute;
  left: 100px;
  top: 40px;
  margin: 0;
  font: 400 120px/1 var(--bl-font-display);
  transform: rotate(-4deg);
  -webkit-text-stroke: 6px #111;
  paint-order: stroke fill;
}
.results__game {
  position: absolute;
  left: 120px;
  top: 170px;
  margin: 0;
  font: 40px var(--bl-font-display);
  color: #ffd60a;
}
.results__podium {
  position: absolute;
  left: 200px;
  bottom: 170px;
  display: flex;
  align-items: flex-end;
  gap: 24px;
}
.step {
  width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.step__name {
  font: 38px var(--bl-font-display);
}
.step__block {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
  color: #111;
  transform: skewX(var(--bl-skew));
}
.step--1 .step__block {
  height: 320px;
  background: var(--bl-color-primary);
  color: #fff;
}
.step--2 .step__block {
  height: 230px;
}
.step--3 .step__block {
  height: 160px;
}
.step__place {
  font: 400 120px/1.1 var(--bl-font-display);
}
.step__points {
  font: 34px var(--bl-font-display);
}
.results__table {
  position: absolute;
  right: 110px;
  top: 220px;
  width: 640px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line {
  display: grid;
  grid-template-columns: 1fr 120px 120px;
  padding: 8px 18px;
  background: #111;
  font: 36px var(--bl-font-display);
  transform: skewX(var(--bl-skew));
}
.line--head {
  background: none;
  color: #888;
  font-size: 26px;
}
.line__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.results__menu {
  position: absolute;
  right: 110px;
  bottom: 60px;
  font-size: 56px;
}
</style>
