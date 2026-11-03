<script setup lang="ts">
import { InputPrompt, MenuList, useGame, useTimeline, useUi } from '@blacklight/ui';
import { onMounted, ref } from 'vue';

const game = useGame();
const ui = useUi();
const logo = ref<HTMLElement | null>(null);
const items = [
  { label: 'NEW GAME', value: 'new' },
  { label: 'CONTINUE', value: 'continue', disabled: true },
  { label: 'CONFIG', value: 'config' },
];
const intro = useTimeline().to(
  logo,
  { x: ['-30%', '0%'], opacity: [0, 1] },
  { duration: 0.4, ease: 'backOut' },
);
onMounted(() => void intro.play());

function select(value: string) {
  if (value === 'new') void game.goto('field', undefined, { transition: 'fade' });
  if (value === 'config') ui.push('Settings');
}
</script>

<template>
  <div class="title">
    <div class="title__stripe" />
    <h1 ref="logo" class="title__logo">BLACK<span>LIGHT</span></h1>
    <MenuList class="title__menu" :items="items" @select="select" />
    <div class="title__prompts"><InputPrompt action="confirm" label="SELECT" :size="44" /></div>
  </div>
</template>

<style scoped>
.title {
  position: absolute;
  inset: 0;
}
/* The backdrop reaches the screen's edges in `extend` mode; the content keeps design coordinates. */
.title::before {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--bl-bleed-y, 0px)) calc(-1 * var(--bl-bleed-x, 0px));
  background: #111;
}
.title__stripe {
  position: absolute;
  inset: calc(-20% - var(--bl-bleed-y, 0px)) 46% calc(-20% - var(--bl-bleed-y, 0px))
    calc(-10% - var(--bl-bleed-x, 0px));
  background: var(--bl-color-primary);
  transform: skewX(-18deg);
}
.title__logo {
  position: absolute;
  left: 140px;
  top: 140px;
  margin: 0;
  font: 400 220px/0.85 var(--bl-font-display);
  color: #fff;
  transform: rotate(-6deg);
  -webkit-text-stroke: 10px #111;
  paint-order: stroke fill;
}
.title__logo span {
  display: block;
  color: #111;
  -webkit-text-stroke: 10px #fff;
}
.title__menu {
  position: absolute;
  right: 220px;
  top: 520px;
  font-size: 72px;
}
.title__prompts {
  position: absolute;
  right: 120px;
  bottom: 80px;
  font: 32px var(--bl-font-display);
}
</style>
