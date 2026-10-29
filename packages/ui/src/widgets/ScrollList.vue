<script setup lang="ts" generic="T">
import { computed, ref } from 'vue';
import { FOCUS_ATTR } from '../focus';

const props = withDefaults(
  defineProps<{
    items: T[];
    /** Row height in virtual pixels (all rows the same height). */
    itemHeight: number;
    /** Visible height in virtual pixels. */
    height: number;
    /** Extra rows rendered above and below the visible ones. */
    overscan?: number;
  }>(),
  { overscan: 4 },
);
defineEmits<{ select: [item: T, index: number] }>();

const scrollTop = ref(0);
const first = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - props.overscan),
);
const last = computed(() =>
  Math.min(
    props.items.length,
    Math.ceil((scrollTop.value + props.height) / props.itemHeight) + props.overscan,
  ),
);
const visible = computed(() =>
  props.items.slice(first.value, last.value).map((item, i) => ({ item, index: first.value + i })),
);
const viewport = ref<HTMLElement | null>(null);

// Moving focus past the rendered rows scrolls one row and renders the next one.
function onNavigate(event: Event, index: number) {
  const { direction } = (event as CustomEvent<{ direction: string }>).detail;
  const step = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
  const target = index + step;
  if (step === 0 || target < 0 || target >= props.items.length) return;
  event.preventDefault();
  const el = viewport.value!;
  const top = target * props.itemHeight;
  if (top < el.scrollTop) el.scrollTop = top;
  else if (top + props.itemHeight > el.scrollTop + props.height)
    el.scrollTop = top + props.itemHeight - props.height;
  scrollTop.value = el.scrollTop;
  requestAnimationFrame(() => {
    el.querySelector<HTMLElement>(`[data-bl-row="${target}"]`)?.dispatchEvent(
      new CustomEvent('bl-request-focus', { bubbles: true }),
    );
  });
}
const focusAttr = { [FOCUS_ATTR]: '' };
</script>

<template>
  <div
    ref="viewport"
    class="bl-scroll"
    :style="{ height: `${height}px` }"
    @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
  >
    <div :style="{ height: `${items.length * itemHeight}px`, position: 'relative' }">
      <div
        v-for="row in visible"
        :key="row.index"
        class="bl-scroll__row"
        v-bind="focusAttr"
        :data-bl-row="row.index"
        :style="{
          position: 'absolute',
          top: `${row.index * itemHeight}px`,
          height: `${itemHeight}px`,
          left: 0,
          right: 0,
        }"
        @bl-navigate="onNavigate($event, row.index)"
        @click="$emit('select', row.item, row.index)"
      >
        <slot :item="row.item" :index="row.index" />
      </div>
    </div>
  </div>
</template>
