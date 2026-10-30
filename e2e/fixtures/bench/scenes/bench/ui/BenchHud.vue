<script setup lang="ts">
import { Counter, Gauge, useTimeline } from '@blacklight/ui';
import { onBeforeUnmount, onMounted, ref } from 'vue';

// The animated UI screen of NF-01: a looping Motion timeline over a column of cards and a ring,
// plus a gauge and a counter that animate to a new value every 400 ms. It covers the whole game,
// so the browser composites the DOM layer over the canvas on every frame.
const ring = ref<HTMLElement | null>(null);
const health = ref(100);
const score = ref(0);
let alive = true;

const loop = useTimeline()
  .to('.hud__card', { x: [-320, 0], opacity: [0, 1] }, { duration: 0.35, ease: 'backOut' })
  .to(ring, { rotate: [0, 180], scale: [1, 1.25] }, { at: '<', duration: 0.7 })
  .label('hold')
  .to('.hud__card', { scale: [1, 1.06, 1] }, { at: 'hold', duration: 0.5 })
  .to('.hud__card', { x: [0, 320], opacity: [1, 0] }, { duration: 0.35, ease: 'easeIn' })
  .to(ring, { rotate: [180, 360], scale: [1.25, 1] }, { at: '<', duration: 0.7 });

let tick = 0;
const values = setInterval(() => {
  tick++;
  health.value = 20 + ((tick * 37) % 80);
  score.value += 125;
}, 400);

onMounted(async () => {
  while (alive) await loop.play();
});
onBeforeUnmount(() => {
  alive = false;
  clearInterval(values);
});
</script>

<template>
  <div class="hud">
    <div class="hud__top">
      <Gauge class="hud__gauge" :value="health" color="#e0e0e0" trail-color="#b33">HP</Gauge>
      <Counter class="hud__score" :value="score" />
    </div>
    <div class="hud__cards">
      <div v-for="i in 8" :key="i" class="hud__card">
        <span class="hud__card-index">{{ i }}</span>
        <span class="hud__card-bar" :style="{ width: `${40 + i * 7}%` }" />
      </div>
    </div>
    <div ref="ring" class="hud__ring" />
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #fff;
  font-size: 28px;
}
.hud__top {
  position: absolute;
  top: 24px;
  left: 24px;
  right: 24px;
  display: flex;
  gap: 32px;
  align-items: center;
}
.hud__gauge {
  width: 40%;
  height: 28px;
}
.hud__score {
  margin-left: auto;
  font-size: 40px;
  font-variant-numeric: tabular-nums;
}
.hud__cards {
  position: absolute;
  left: 24px;
  top: 96px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 300px;
}
.hud__card {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 16px;
  border-radius: 16px;
  background: rgba(40, 40, 40, 0.85);
}
.hud__card-bar {
  height: 10px;
  border-radius: 5px;
  background: #e0e0e0;
}
.hud__ring {
  position: absolute;
  right: 48px;
  bottom: 48px;
  width: 140px;
  height: 140px;
  border: 14px solid #e0e0e0;
  border-right-color: transparent;
  border-radius: 50%;
}
</style>
