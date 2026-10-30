<script setup lang="ts">
import { MenuList, SettingsScreen, onUiStep, useGame, useScreen, useUi } from '@blacklight/ui';
import { computed, onUnmounted } from 'vue';
import type Match from '../match.scene';

// Offline the pause menu stops the game logic; online the match keeps running for everybody, so
// the menu only offers to leave.
const props = defineProps<{ match: Match }>();
const game = useGame();
const ui = useUi();
const screen = useScreen({ enter: 'slash', leave: 'fade' });
const online = !!props.match.setup.online;
if (!online) game.pause();
onUnmounted(() => {
  if (!online) game.resume();
});

const items = computed(() =>
  online
    ? [
        { label: 'RESUME', value: 'resume' },
        { label: 'LEAVE MATCH', value: 'leave' },
      ]
    : [
        { label: 'RESUME', value: 'resume' },
        { label: 'RESTART', value: 'restart' },
        { label: 'SETTINGS', value: 'settings' },
        { label: 'QUIT TO GAMES', value: 'quit' },
      ],
);

onUiStep(
  () => {
    const pad = game.input.uiPlayer(1);
    if (pad.pressed('pause') && !pad.pressed('back')) screen.close();
  },
  { onlyOnTop: true },
);

async function select(value: string) {
  switch (value) {
    case 'resume':
      screen.close();
      break;
    case 'restart':
      void game.goto('match', { ...props.match.setup }, { transition: 'fade' });
      break;
    case 'settings':
      ui.push(SettingsScreen, { tabs: ['audio', 'video', 'controls', 'accessibility'] });
      break;
    case 'quit':
    case 'leave':
      if (
        await ui.confirm({
          title: 'QUIT',
          message: 'Leave this mini-game?',
          confirm: 'LEAVE',
          danger: true,
        })
      )
        void game.goto(online ? 'online' : 'game-select', undefined, { transition: 'fade' });
      break;
  }
}
</script>

<template>
  <div class="pause">
    <div class="pause__band" />
    <h1 class="pause__title">PAUSE</h1>
    <MenuList class="pause__menu" :items="items" @select="select" />
    <p class="pause__note">{{ online ? 'The match goes on for the others.' : match.title }}</p>
  </div>
</template>

<style scoped>
.pause {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}
.pause__band {
  position: absolute;
  inset: -10% 46% -10% -20%;
  background: var(--bl-color-primary);
  transform: skewX(-14deg);
}
.pause__title {
  position: absolute;
  left: 120px;
  top: 60px;
  margin: 0;
  font: 400 150px/1 var(--bl-font-display);
  color: #111;
  transform: rotate(-8deg);
  -webkit-text-stroke: 6px #fff;
  paint-order: stroke fill;
}
.pause__menu {
  position: absolute;
  left: 160px;
  top: 300px;
  font-size: 76px;
}
.pause__note {
  position: absolute;
  left: 170px;
  bottom: 80px;
  margin: 0;
  font: 34px var(--bl-font-display);
  color: #fff;
}
</style>
