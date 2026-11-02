<script setup lang="ts">
import {
  InputPrompt,
  MenuList,
  SettingsScreen,
  toast,
  useGame,
  useTimeline,
  useUi,
} from '@blacklight/ui';
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { accountsOf } from '../../../party/accounts';

const game = useGame();
const ui = useUi();
// Without an issuer in game.config.ts there is no accounts module and no SIGN IN entry.
const accounts = accountsOf(game);
const user = shallowRef(accounts?.user);
const stops = accounts
  ? [
      accounts.on('login', (value) => (user.value = value)),
      accounts.on('logout', () => (user.value = undefined)),
      accounts.on('error', (error) => toast(error.message, { kind: 'error' })),
    ]
  : [];
onUnmounted(() => stops.forEach((stop) => stop()));

const logo = ref<HTMLElement | null>(null);
const intro = useTimeline().to(
  logo,
  { x: ['-40%', '0%'], rotate: [-14, -6], opacity: [0, 1] },
  { duration: 0.45, ease: 'backOut' },
);
onMounted(() => void intro.play());

const items = computed(() => [
  { label: 'LOCAL PARTY', value: 'local', hint: 'Up to 8 players on this screen' },
  { label: 'ONLINE', value: 'online', hint: 'Play through a relay with a room code' },
  { label: 'SETTINGS', value: 'settings' },
  ...(!accounts
    ? []
    : user.value
      ? [
          {
            label: 'SIGN OUT',
            value: 'logout',
            hint: `Signed in as ${user.value.name ?? 'player'}`,
          },
        ]
      : [{ label: 'SIGN IN', value: 'login', hint: 'Account (optional)' }]),
]);

async function select(value: string) {
  switch (value) {
    case 'local':
      void game.goto('player-select', undefined, { transition: 'slash' });
      break;
    case 'online':
      void game.goto('online', undefined, { transition: 'slash' });
      break;
    case 'settings':
      ui.push(SettingsScreen, { tabs: ['audio', 'video', 'controls', 'accessibility'] });
      break;
    case 'login':
      try {
        await accounts?.login();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), { kind: 'error' });
      }
      break;
    case 'logout':
      await accounts?.logout();
      break;
  }
}
</script>

<template>
  <div class="title">
    <div class="title__stripe" />
    <h1 ref="logo" class="title__logo">PARTY<span>NIGHT</span></h1>
    <p class="title__tagline">Six mini-games · 1 to 8 players · couch or online</p>
    <MenuList class="title__menu" :items="items" @select="select" />
    <div class="title__prompts"><InputPrompt action="confirm" label="SELECT" :size="44" /></div>
  </div>
</template>

<style scoped>
.title {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.title__stripe {
  position: absolute;
  inset: -20% 50% -20% -12%;
  background: var(--bl-color-primary);
  transform: skewX(-16deg);
}
.title__logo {
  position: absolute;
  left: 130px;
  top: 90px;
  margin: 0;
  font: 400 210px/0.85 var(--bl-font-display);
  color: #fff;
  transform: rotate(-6deg);
  -webkit-text-stroke: 10px #111;
  paint-order: stroke fill;
}
.title__logo span {
  display: block;
  margin-left: 120px;
  color: #ffd60a;
}
.title__tagline {
  position: absolute;
  left: 170px;
  top: 500px;
  margin: 0;
  font: 34px var(--bl-font-body);
  color: #fff;
}
.title__menu {
  position: absolute;
  left: 180px;
  top: 600px;
  font-size: 66px;
}
.title__prompts {
  position: absolute;
  right: 120px;
  bottom: 60px;
  font: 32px var(--bl-font-display);
  color: #fff;
}
</style>
