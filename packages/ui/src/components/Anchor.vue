<script setup lang="ts">
import { computed } from 'vue';
import { useUiRuntime } from '../composables';

export type AnchorPoint =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

const props = withDefaults(
  defineProps<{
    /** Point of the safe area the content sticks to. */
    to?: AnchorPoint;
    /** Offset in virtual pixels, towards the inside. */
    offset?: [number, number];
    /** Use the safe area (notches, system bars); `false` uses the design area. */
    safe?: boolean;
    /** Follow the player's UI scale setting. */
    scaled?: boolean;
  }>(),
  { to: 'top-left', offset: () => [0, 0], safe: true, scaled: true },
);

const runtime = useUiRuntime();
const style = computed(() => {
  const area =
    props.safe && runtime.safeArea.width > 0
      ? runtime.safeArea
      : { x: 0, y: 0, width: runtime.frame.width, height: runtime.frame.height };
  const fx = props.to.includes('left') ? 0 : props.to.includes('right') ? 1 : 0.5;
  const fy = props.to.startsWith('top') ? 0 : props.to.startsWith('bottom') ? 1 : 0.5;
  const [ox, oy] = props.offset;
  const x = area.x + area.width * fx + (fx === 0 ? ox : fx === 1 ? -ox : ox);
  const y = area.y + area.height * fy + (fy === 0 ? oy : fy === 1 ? -oy : oy);
  const scale = props.scaled ? runtime.scale.value : 1;
  return {
    left: `${x}px`,
    top: `${y}px`,
    transform: `translate(${-fx * 100}%, ${-fy * 100}%) scale(${scale})`,
    transformOrigin: `${fx * 100}% ${fy * 100}%`,
  };
});
</script>

<template>
  <div class="bl-anchor" :style="style"><slot /></div>
</template>
