<script setup lang="ts">
import { computed } from 'vue';
import { SKINS } from '../party/skins';

// A player's skin in the menus and banners: the same shapes as `drawSkin`, as SVG.
const props = withDefaults(defineProps<{ skin: number; size?: number; dim?: boolean }>(), {
  size: 96,
  dim: false,
});
const look = computed(() => SKINS[props.skin % SKINS.length]!);
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const body = computed(() => hex(look.value.body));
const accent = computed(() => hex(look.value.accent));
</script>

<template>
  <svg
    class="skin"
    :class="{ 'skin--dim': dim }"
    :width="size"
    :height="size"
    viewBox="-50 -60 100 110"
    aria-hidden="true"
  >
    <template v-if="look.pattern === 'horns'">
      <polygon points="-30,-14 -21,-50 -8,-30" :fill="accent" />
      <polygon points="30,-14 21,-50 8,-30" :fill="accent" />
    </template>
    <template v-else-if="look.pattern === 'ears'">
      <circle cx="-24" cy="-28" r="14" :fill="body" />
      <circle cx="24" cy="-28" r="14" :fill="body" />
      <circle cx="-24" cy="-28" r="7" :fill="accent" />
      <circle cx="24" cy="-28" r="7" :fill="accent" />
    </template>
    <template v-else-if="look.pattern === 'spikes'">
      <polygon
        v-for="i in 5"
        :key="i"
        points="-6,-24 0,-52 6,-24"
        :fill="accent"
        :transform="`rotate(${(i - 3) * 28})`"
      />
    </template>
    <polygon
      v-else-if="look.pattern === 'crown'"
      points="-22,-26 -22,-48 -11,-37 0,-52 11,-37 22,-48 22,-26"
      :fill="accent"
    />
    <circle r="37" :fill="body" stroke="#111" stroke-width="4" />
    <rect v-if="look.pattern === 'band'" x="-34" y="-23" width="68" height="11" :fill="accent" />
    <rect
      v-if="look.pattern === 'visor'"
      x="-28"
      y="-16"
      width="56"
      height="22"
      rx="11"
      :fill="accent"
    />
    <template v-if="look.pattern === 'dots'">
      <circle cx="-17" cy="17" r="6" :fill="accent" />
      <circle cx="18" cy="15" r="4.5" :fill="accent" />
      <circle cx="0" cy="25" r="4" :fill="accent" />
    </template>
    <template v-if="look.pattern === 'stripes'">
      <rect x="-26" y="7" width="52" height="6" :fill="accent" />
      <rect x="-20" y="18" width="40" height="6" :fill="accent" />
    </template>
    <circle cx="-12" cy="-3" r="9" fill="#fff" />
    <circle cx="12" cy="-3" r="9" fill="#fff" />
    <circle cx="-12" cy="0" r="4" fill="#111" />
    <circle cx="12" cy="0" r="4" fill="#111" />
  </svg>
</template>

<style scoped>
.skin {
  display: block;
  overflow: visible;
}
.skin--dim {
  filter: grayscale(1) brightness(0.5);
}
</style>
