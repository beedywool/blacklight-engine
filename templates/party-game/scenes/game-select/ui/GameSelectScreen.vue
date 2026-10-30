<script setup lang="ts">
import { Button, FocusGroup, InputPrompt, Select, onUiStep, useGame, vFocus } from '@blacklight/ui';
import { computed, reactive, ref, shallowRef } from 'vue';
import SkinBadge from '@ui/SkinBadge.vue';
import {
  MINI_GAMES,
  defaultSettings,
  playable,
  type MiniGameId,
  type MiniGameSettings,
} from '../../../party/catalog';
import { party } from '../../../party/session';

const game = useGame();
const players = party.members.length;
const current = shallowRef<MiniGameId>(party.game ?? MINI_GAMES[0].scene);
const info = computed(() => MINI_GAMES.find((g) => g.scene === current.value)!);
const settings = reactive(
  Object.fromEntries(
    MINI_GAMES.map((g) => [g.scene, [...(party.settings[g.scene] ?? defaultSettings(g.scene))]]),
  ) as Record<MiniGameId, MiniGameSettings>,
);
const canPlay = computed(() => playable(current.value, players));
const details = ref<HTMLElement | null>(null);

function art(path: string): string | undefined {
  try {
    const file = game.assets.find(path, { extensions: ['svg'] })[0];
    return file ? game.assets.url(file) : undefined;
  } catch {
    return undefined;
  }
}

/** Confirming a card moves the focus to its settings. */
function choose(id: MiniGameId) {
  current.value = id;
  details.value
    ?.querySelector('[data-bl-focus]')
    ?.dispatchEvent(new CustomEvent('bl-request-focus', { bubbles: true }));
}

function play() {
  if (!canPlay.value) return;
  party.game = current.value;
  party.settings[current.value] = [...settings[current.value]];
  void game.goto(
    'match',
    { game: current.value, settings: [...settings[current.value]] },
    { transition: 'iris' },
  );
}

onUiStep(
  () => {
    if (game.input.uiPlayer(1).pressed('back'))
      void game.goto('player-select', undefined, { transition: 'fade' });
  },
  { onlyOnTop: true },
);
</script>

<template>
  <div class="select">
    <h1 class="select__title">PICK A GAME</h1>
    <div class="select__players">
      <span>{{ players }}P</span>
      <SkinBadge v-for="m in party.members" :key="m.player" :skin="m.skin" :size="54" />
    </div>
    <FocusGroup class="select__cards" wrap>
      <div
        v-for="(g, i) in MINI_GAMES"
        :key="g.scene"
        v-focus="true"
        :data-bl-autofocus="g.scene === current || (i === 0 && !party.game) ? '' : undefined"
        class="card"
        :class="{ 'card--current': g.scene === current, 'card--off': !playable(g.scene, players) }"
        :data-game="g.scene"
        @focus="current = g.scene"
        @click="choose(g.scene)"
      >
        <img class="card__art" :src="art(g.art)" alt="" />
        <span class="card__name">{{ g.title }}</span>
        <span class="card__players">{{ g.minPlayers }}–{{ g.maxPlayers }}P</span>
      </div>
    </FocusGroup>
    <div ref="details" class="details">
      <h2 class="details__name">{{ info.title }}</h2>
      <p class="details__text">{{ info.description }}</p>
      <p class="details__players" :class="{ 'details__players--off': !canPlay }">
        {{ info.minPlayers }} TO {{ info.maxPlayers }} PLAYERS
        <template v-if="!canPlay"> · NEEDS {{ info.minPlayers }}+</template>
      </p>
      <Select
        v-for="(setting, s) in info.settings"
        :key="`${current}-${s}`"
        v-model="settings[current][s]"
        class="details__setting"
        :label="setting.label"
        :options="setting.options.map((label, value) => ({ label, value }))"
      />
      <Button class="details__play" :disabled="!canPlay" @click="play">PLAY!</Button>
    </div>
    <div class="select__prompts">
      <InputPrompt action="confirm" label="SELECT" :size="40" />
      <InputPrompt action="back" label="PLAYERS" :size="40" />
    </div>
  </div>
</template>

<style scoped>
.select {
  position: absolute;
  inset: 0;
  color: #fff;
}
.select__title {
  position: absolute;
  left: 100px;
  top: 40px;
  margin: 0;
  font: 400 110px/1 var(--bl-font-display);
  transform: rotate(-3deg);
}
.select__players {
  position: absolute;
  right: 100px;
  top: 70px;
  display: flex;
  align-items: center;
  gap: 8px;
  font: 44px var(--bl-font-display);
  color: #fff;
}
.select__cards {
  position: absolute;
  left: 100px;
  top: 220px;
  display: grid;
  grid-template-columns: repeat(3, 300px);
  gap: 36px 32px;
}
.card {
  position: relative;
  height: 330px;
  background: #1d1d24;
  border: 4px solid #333;
  transform: skewX(var(--bl-skew));
  overflow: hidden;
  cursor: pointer;
}
.card[data-bl-focused] {
  border-color: #fff;
  box-shadow: 12px 12px 0 var(--bl-color-primary);
}
.card--off {
  filter: grayscale(0.9) brightness(0.6);
}
.card__art {
  display: block;
  width: 100%;
  height: 230px;
  object-fit: cover;
  background: #2a2a33;
}
.card__name {
  display: block;
  padding: 10px 14px 0;
  font: 34px/1 var(--bl-font-display);
}
.card__players {
  position: absolute;
  right: 12px;
  top: 10px;
  padding: 2px 10px;
  background: #111;
  font: 26px var(--bl-font-display);
}
.details {
  position: absolute;
  left: 1240px;
  top: 220px;
  width: 600px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.details__name {
  margin: 0;
  font: 400 76px/1 var(--bl-font-display);
  color: #fff;
  -webkit-text-stroke: 4px #111;
  paint-order: stroke fill;
}
.details__text {
  margin: 0;
  font: 30px/1.35 var(--bl-font-body);
}
.details__players {
  margin: 0;
  font: 32px var(--bl-font-display);
  color: #111;
}
.details__players--off {
  color: #ffd60a;
}
.details__setting {
  font-size: 36px;
}
.details__play {
  margin-top: 16px;
  align-self: flex-start;
  font-size: 64px;
}
.select__prompts {
  position: absolute;
  right: 100px;
  bottom: 50px;
  display: flex;
  gap: 40px;
  font: 28px var(--bl-font-display);
}
</style>
