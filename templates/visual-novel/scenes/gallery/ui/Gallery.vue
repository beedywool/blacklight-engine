<script setup lang="ts">
import { InputPrompt, onUiStep, t, useGame, vFocus } from '@blacklight/ui';
import { computed, shallowRef } from 'vue';
import { GALLERY, unlocked } from '@ui/state';

const game = useGame();
const open = computed(() => new Set(unlocked(game)));
const zoomed = shallowRef<string | null>(null);

function url(id: string): string | undefined {
  try {
    const path = game.assets.find(id, { extensions: ['svg', 'png', 'webp', 'jpg'] })[0];
    return path ? game.assets.url(path) : undefined;
  } catch {
    return undefined;
  }
}

function view(id: string) {
  if (open.value.has(id)) zoomed.value = zoomed.value === id ? null : id;
}

onUiStep(() => {
  if (!game.input.uiPlayer(1).pressed('back')) return;
  if (zoomed.value) zoomed.value = null;
  else void game.goto('title', undefined, { transition: 'wipe' });
});
</script>

<template>
  <div class="gallery">
    <h1 class="gallery__title">{{ t('gallery.title') }}</h1>
    <p class="gallery__count">
      {{ t('gallery.unlocked', { count: open.size, total: GALLERY.length }) }}
    </p>
    <div class="gallery__grid" data-bl-focus-group="wrap x">
      <div
        v-for="id in GALLERY"
        :key="id"
        v-focus
        class="gallery__item"
        :class="{ 'gallery__item--locked': !open.has(id) }"
        :data-cg="id"
        @click="view(id)"
      >
        <img v-if="open.has(id)" :src="url(id)" :alt="t(`gallery.${id}`)" />
        <span v-else class="gallery__lock">{{ t('gallery.locked') }}</span>
        <span class="gallery__caption">{{ open.has(id) ? t(`gallery.${id}`) : '???' }}</span>
      </div>
    </div>
    <img v-if="zoomed" class="gallery__zoom" :src="url(zoomed)" alt="" @click="zoomed = null" />
    <div class="gallery__prompts">
      <InputPrompt action="back" :label="t('bl.common.back')" :size="44" />
    </div>
  </div>
</template>

<style scoped>
.gallery {
  position: absolute;
  inset: 0;
  padding: 70px 140px;
  color: #fff;
}
.gallery__title {
  margin: 0;
  font: 400 120px/1 var(--bl-font-display);
  color: var(--bl-color-primary);
  transform: rotate(-3deg);
}
.gallery__count {
  font: 30px var(--bl-font-body);
  margin: 12px 0 40px;
}
.gallery__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px;
}
.gallery__item {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #222;
  display: grid;
  place-items: center;
  transform: skewX(var(--bl-skew));
  transition: transform 120ms;
}
.gallery__item[data-bl-focused] {
  outline: 6px solid #fff;
  transform: skewX(var(--bl-skew)) scale(1.04);
}
.gallery__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gallery__lock {
  font: 40px var(--bl-font-display);
  color: #666;
}
.gallery__caption {
  position: absolute;
  inset-inline-start: 0;
  bottom: -46px;
  font: 28px var(--bl-font-display);
}
.gallery__zoom {
  position: absolute;
  inset: 60px 160px;
  width: calc(100% - 320px);
  height: calc(100% - 120px);
  object-fit: contain;
  background: #000;
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.8);
}
.gallery__prompts {
  position: absolute;
  inset-inline-end: 120px;
  bottom: 70px;
  font: 32px var(--bl-font-display);
}
</style>
