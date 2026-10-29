<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue';
import type { Point } from '@blacklight/core';
import { useGame } from '../composables';
import { onAfterDraw } from '../frame';
import { visibleArea, worldToUi, type WorldTarget } from '../world';

/**
 * Keeps its content over a game object or a world point (name tags, health bars, interaction
 * hints). Hidden while the target is off-screen or destroyed, or kept at the screen edge with
 * `clamp`.
 */
const props = withDefaults(
  defineProps<{
    target: WorldTarget;
    /** Offset from the target in virtual pixels (`{ x: 0, y: -80 }` above a character). */
    offset?: Point;
    /** Distance beyond the screen edge before it hides, virtual pixels. */
    margin?: number;
    /** Stay on screen at the nearest edge instead of hiding (off-screen indicators). */
    clamp?: boolean;
    /** Which point of the content sits on the target. */
    align?: 'center' | 'bottom' | 'top';
  }>(),
  { offset: () => ({ x: 0, y: 0 }), margin: 0, clamp: false, align: 'bottom' },
);
const game = useGame();
const position = reactive({ x: 0, y: 0, visible: false, clamped: false });

function update() {
  const ui = worldToUi(game, props.target, { offset: props.offset, margin: props.margin });
  let { x, y } = ui;
  let clamped = false;
  const destroyed = 'destroyed' in props.target && props.target.destroyed;
  if (!ui.onScreen && props.clamp && !destroyed) {
    const area = visibleArea(game);
    const nx = Math.min(area.x + area.width - 32, Math.max(area.x + 32, x));
    const ny = Math.min(area.y + area.height - 32, Math.max(area.y + 32, y));
    clamped = nx !== x || ny !== y;
    x = nx;
    y = ny;
  }
  position.x = x;
  position.y = y;
  position.visible = (ui.onScreen || props.clamp) && !destroyed;
  position.clamped = clamped;
}

let off: (() => void) | undefined;
onMounted(() => {
  update();
  off = onAfterDraw(game, update);
});
onBeforeUnmount(() => off?.());

const translate = { center: '-50%, -50%', bottom: '-50%, -100%', top: '-50%, 0' };
</script>

<template>
  <div
    class="bl-world-anchor"
    :class="{ 'bl-world-anchor--clamped': position.clamped }"
    :data-offscreen="!position.visible || undefined"
    :style="{
      transform: `translate(${position.x}px, ${position.y}px) translate(${translate[align]})`,
      visibility: position.visible ? undefined : 'hidden',
    }"
  >
    <slot :clamped="position.clamped" />
  </div>
</template>
