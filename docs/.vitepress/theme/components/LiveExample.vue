<script setup lang="ts">
// <LiveExample src="behaviors/platformer" />: the example's code in an editor next to the real
// engine running it. Every edit re-runs the preview after a short pause in typing.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { ProjectFiles, RenderReport } from '../../../runner/protocol';
import { loadExample } from '../examples';
import CodePane from './CodePane.vue';
import RunnerFrame from './RunnerFrame.vue';

const props = withDefaults(
  defineProps<{
    src: string;
    /** One line under the title: what to try in the preview. */
    hint?: string;
  }>(),
  { hint: '' },
);

const DEBOUNCE_MS = 600;
const root = ref<HTMLElement | null>(null);
const original = shallowRef<ProjectFiles>();
const files = shallowRef<ProjectFiles>();
const running = shallowRef<ProjectFiles>();
const editable = ref<string[]>([]);
const active = ref('main.ts');
const visible = ref(false);
const runs = ref(0);
const status = ref<'idle' | 'loading' | 'running' | 'error'>('idle');
const error = ref('');
const report = ref<RenderReport>();
/** Runs started so far, for tests waiting for the next one. */
const started = ref(0);
const changed = computed(
  () =>
    !!files.value &&
    !!original.value &&
    editable.value.some((path) => files.value![path] !== original.value![path]),
);
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: IntersectionObserver | undefined;

function onChange(path: string, text: string) {
  if (!files.value || files.value[path] === text) return;
  files.value = { ...files.value, [path]: text };
  clearTimeout(timer);
  timer = setTimeout(() => (running.value = files.value), DEBOUNCE_MS);
}

function onStatus(next: 'loading' | 'running' | 'error', detail?: RenderReport | string) {
  // The first error wins: later ones are usually consequences.
  if (status.value === 'error' && next === 'running') return;
  status.value = next;
  if (next === 'loading') {
    error.value = '';
    report.value = undefined;
    started.value++;
  }
  if (next === 'error' && !error.value) error.value = String(detail);
  if (next === 'running') report.value = detail as RenderReport;
}

function reset() {
  files.value = original.value;
  running.value = original.value;
}

onMounted(async () => {
  const example = await loadExample(props.src);
  // Unmounted while loading (navigation, hot reload).
  if (!root.value) return;
  original.value = example.files;
  files.value = example.files;
  running.value = example.files;
  editable.value = example.editable;
  active.value = example.editable[0]!;
  // Previews start when scrolled near and stop far away: a page holds many, browsers cap WebGL.
  observer = new IntersectionObserver(
    ([entry]) => {
      visible.value = entry!.isIntersecting;
      if (!entry!.isIntersecting) status.value = 'idle';
    },
    { rootMargin: '400px 0px' },
  );
  observer.observe(root.value!);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(timer);
});
</script>

<template>
  <figure
    ref="root"
    class="bl-live"
    :data-example="src"
    :data-status="status"
    :data-lit="report?.lit"
    :data-error="error || undefined"
    :data-run="started"
  >
    <div class="bl-live__bar">
      <div class="bl-live__tabs" role="tablist">
        <button
          v-for="path in editable"
          :key="path"
          type="button"
          role="tab"
          class="bl-live__tab"
          :aria-selected="path === active"
          @click="active = path"
        >
          {{ path }}
        </button>
      </div>
      <span class="bl-live__status" :class="`is-${status}`">{{
        status === 'idle' ? 'paused' : status
      }}</span>
      <button v-if="changed" type="button" class="bl-live__button" @click="reset">Reset</button>
      <button type="button" class="bl-live__button" @click="runs++">Run again</button>
    </div>
    <div class="bl-live__body">
      <div class="bl-live__editor">
        <CodePane v-if="files" :path="active" :text="files[active] ?? ''" @change="onChange" />
      </div>
      <div class="bl-live__preview">
        <RunnerFrame
          v-if="visible && running"
          :files="running"
          mode="example"
          :run="runs"
          :title="`Preview of ${src}`"
          @status="onStatus"
        />
        <p v-else class="bl-live__placeholder">Preview starts when visible</p>
      </div>
    </div>
    <figcaption v-if="hint || error" class="bl-live__caption">
      <pre v-if="error" class="bl-live__error">{{ error }}</pre>
      <span v-else>{{ hint }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.bl-live {
  container-type: inline-size;
  margin: 24px 0;
  border-radius: 20px;
  background: var(--bl-surface-container);
  overflow: hidden;
}
.bl-live__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bl-surface-high);
}
.bl-live__tabs {
  display: flex;
  flex: 1;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
}
.bl-live__tab,
.bl-live__button {
  border-radius: 999px;
  padding: 2px 12px;
  font-size: 13px;
  font-family: var(--vp-font-family-mono);
  color: var(--bl-on-surface-variant);
  white-space: nowrap;
  transition: background-color 0.2s var(--bl-ease);
}
.bl-live__tab[aria-selected='true'] {
  background: var(--bl-primary-container);
  color: #ffffff;
}
.bl-live__button {
  font-family: var(--vp-font-family-base);
  font-weight: 600;
  background: var(--bl-primary-container);
  color: var(--bl-on-surface);
}
.bl-live__tab:hover,
.bl-live__button:hover {
  background: var(--bl-surface-highest);
}
.bl-live__status {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bl-outline);
}
.bl-live__status.is-running {
  color: #ffffff;
}
.bl-live__status.is-error {
  color: #f2b8b5;
}
.bl-live__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.bl-live__editor {
  height: 320px;
  border-top: 1px solid var(--bl-outline-variant);
}
.bl-live__preview {
  aspect-ratio: 16 / 9;
  background: var(--bl-surface);
  order: -1;
}
@container (min-width: 720px) {
  .bl-live__body {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  }
  .bl-live__editor {
    height: auto;
    min-height: 300px;
    max-height: 460px;
    border-top: 0;
  }
  .bl-live__preview {
    order: 0;
    align-self: start;
  }
}
.bl-live__placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  margin: 0;
  color: var(--bl-outline);
  font-size: 14px;
}
.bl-live__caption {
  padding: 8px 16px 12px;
  font-size: 14px;
  color: var(--bl-on-surface-variant);
}
.bl-live__error {
  margin: 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: #8c1d18;
  color: #f9dedc;
  font: 13px/1.5 var(--vp-font-family-mono);
  white-space: pre-wrap;
}
</style>
