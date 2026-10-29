<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { CanvasSource, Sprite, Texture, type Filter } from 'pixi.js';
import { useGame, useUiRuntime } from '../composables';
import { createFxFilter, type FxFilter, type FxName } from '../fx/filters';
import { drawElement } from '../fx/snapshot';

/**
 * Draws its content in the FX canvas (above the UI) so it can go through shaders (L1). The DOM
 * content stays in place, invisible, and keeps receiving focus, clicks and input.
 */
const props = withDefaults(
  defineProps<{
    /** Effects applied to the rendered content. */
    fx?: (FxName | Filter)[];
    /** Strength of every built-in effect, 0–1. */
    strength?: number;
    /** Redraw when the content changes (text, attributes, focus). */
    live?: boolean;
    /** Most redraws per second while the content changes. */
    fps?: number;
  }>(),
  { fx: () => [], strength: 1, live: true, fps: 30 },
);
const emit = defineEmits<{ rendered: []; fallback: [error: unknown] }>();
const game = useGame();
const runtime = useUiRuntime();
const host = ref<HTMLElement | null>(null);
const state = shallowRef<'pending' | 'rendered' | 'fallback'>('pending');

let sprite: Sprite | undefined;
let filters: (FxFilter | Filter)[] = [];
let observer: MutationObserver | undefined;
let rendering = false;
let dirty = false;
let lastRender = 0;
let destroyed = false;
let offFrame: (() => void) | undefined;

function applyStrength() {
  for (const filter of filters) if ('strength' in filter) (filter as FxFilter).strength = props.strength;
}
watch(() => props.strength, applyStrength);

async function render() {
  const element = host.value;
  if (!element || !sprite || destroyed) return;
  if (rendering) {
    dirty = true;
    return;
  }
  rendering = true;
  dirty = false;
  lastRender = performance.now();
  try {
    const canvas = document.createElement('canvas');
    const scale = runtime.frame.scale * (globalThis.devicePixelRatio || 1);
    await drawElement(element, canvas, scale);
    if (destroyed) return;
    const old = sprite.texture;
    sprite.texture = new Texture({ source: new CanvasSource({ resource: canvas }) });
    if (old !== Texture.EMPTY) old.destroy(true);
    if (state.value !== 'rendered') {
      state.value = 'rendered';
      emit('rendered');
    }
  } catch (error) {
    fallback(error);
  } finally {
    rendering = false;
  }
  if (dirty) schedule();
}

function schedule() {
  const wait = Math.max(0, 1000 / props.fps - (performance.now() - lastRender));
  setTimeout(() => void render(), wait);
}

function fallback(error: unknown) {
  state.value = 'fallback';
  if (sprite) sprite.visible = false;
  console.warn(
    '[blacklight] <PixiRender> could not draw its content into a texture; showing the DOM version without effects.',
    error,
  );
  emit('fallback', error);
}

function place() {
  const element = host.value;
  if (!element || !sprite || state.value !== 'rendered') return;
  const rect = element.getBoundingClientRect();
  const mount = game.mount.getBoundingClientRect();
  const visible = element.checkVisibility?.({ visibilityProperty: true } as never) ?? true;
  sprite.visible = visible && rect.width > 0;
  sprite.position.set(rect.left - mount.left, rect.top - mount.top);
  sprite.width = rect.width;
  sprite.height = rect.height;
  for (const filter of filters) if ('time' in filter) (filter as FxFilter).time = performance.now() / 1000;
}

onMounted(async () => {
  try {
    const overlay = await runtime.fx.overlay();
    if (destroyed) return;
    sprite = new Sprite(Texture.EMPTY);
    filters = props.fx.map((fx) => (typeof fx === 'string' ? createFxFilter(fx) : fx));
    applyStrength();
    sprite.filters = filters;
    overlay.stage.addChild(sprite);
    offFrame = game.events.on('frame', place);
    if (props.live) {
      observer = new MutationObserver(() => {
        if (!rendering) schedule();
        else dirty = true;
      });
      observer.observe(host.value!, { subtree: true, childList: true, attributes: true, characterData: true });
    }
    await render();
    place();
  } catch (error) {
    fallback(error);
  }
});

onBeforeUnmount(() => {
  destroyed = true;
  observer?.disconnect();
  offFrame?.();
  if (sprite) {
    sprite.removeFromParent();
    if (sprite.texture !== Texture.EMPTY) sprite.texture.destroy(true);
    sprite.destroy();
  }
});
</script>

<template>
  <div
    ref="host"
    class="bl-pixi-render"
    :data-bl-pixi-render="state"
    :style="{ opacity: state === 'rendered' ? 0 : undefined }"
  >
    <slot />
  </div>
</template>
