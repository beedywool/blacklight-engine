<script setup lang="ts">
import { MenuList, onUiStep, useGame, useTimeline } from '@blacklight/ui';
import { computed, onMounted, ref, shallowRef } from 'vue';
import SkinBadge from '@ui/SkinBadge.vue';
import { party, ranking } from '../../../party/session';
import type Match from '../match.scene';

// The end panel of a mini-game: the winner, then results, replay or back to the cards.
const props = defineProps<{ match: Match }>();
const game = useGame();
const online = !!props.match.setup.online;
const top = computed(() => (party.last ? ranking(party.last).filter((r) => r.rank === 1) : []));
const panel = ref<HTMLElement | null>(null);
const intro = useTimeline().to(
  panel,
  { y: [200, 0], opacity: [0, 1] },
  { duration: 0.35, ease: 'backOut' },
);
onMounted(() => void intro.play());

// Players are mashing buttons when the game ends: the menu appears once nobody holds confirm.
const armed = shallowRef(false);
let calm = 0;
onUiStep(() => {
  if (armed.value) return;
  const held = game.input.joinedPlayers.some((p) => game.input.uiPlayer(p.number).held('confirm'));
  calm = held ? 0 : calm + 1;
  if (calm >= 20) armed.value = true;
});

const items = online
  ? [
      { label: 'RESULTS', value: 'results' },
      { label: 'LEAVE', value: 'leave' },
    ]
  : [
      { label: 'RESULTS', value: 'results' },
      { label: 'REPLAY', value: 'replay' },
      { label: 'GAMES', value: 'games' },
    ];

function select(value: string) {
  switch (value) {
    case 'results':
      void game.goto('results', undefined, { transition: 'slices' });
      break;
    case 'replay':
      void game.goto('match', { ...props.match.setup }, { transition: 'iris' });
      break;
    case 'games':
      void game.goto('game-select', undefined, { transition: 'fade' });
      break;
    case 'leave':
      void game.goto('online', undefined, { transition: 'fade' });
      break;
  }
}
</script>

<template>
  <div class="end">
    <div ref="panel" class="end__panel">
      <h2 class="end__title">{{ top.length > 1 ? 'DRAW!' : 'WINNER!' }}</h2>
      <div class="end__winners">
        <div v-for="row in top" :key="row.contestant.player" class="end__winner">
          <SkinBadge :skin="row.contestant.skin" :size="110" />
          <span>{{ row.contestant.name }}</span>
          <span class="end__points">{{ row.points }} PTS</span>
        </div>
      </div>
      <MenuList v-if="armed" class="end__menu" :items="items" horizontal @select="select" />
      <div v-else class="end__menu end__menu--wait" />
    </div>
  </div>
</template>

<style scoped>
.end {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
.end__panel {
  position: absolute;
  left: 560px;
  right: 180px;
  top: 300px;
  padding: 30px 40px 40px;
  background: #111;
  border: 6px solid #fff;
  box-shadow: 18px 18px 0 var(--bl-color-primary);
  transform: skewX(var(--bl-skew));
  color: #fff;
}
.end__title {
  margin: 0;
  font: 400 110px/1 var(--bl-font-display);
  color: #ffd60a;
}
.end__winners {
  display: flex;
  gap: 40px;
  margin: 20px 0 30px;
}
.end__winner {
  display: flex;
  align-items: center;
  gap: 16px;
  font: 44px var(--bl-font-display);
}
.end__points {
  color: var(--bl-color-primary);
}
.end__menu {
  font-size: 56px;
}
.end__menu--wait {
  height: 1.3em;
}
</style>
