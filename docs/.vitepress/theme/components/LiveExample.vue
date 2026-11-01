<script setup lang="ts">
// <LiveExample src="behaviors/platformer" />: the example runs in the page; the button opens the
// code full screen, editor on the left, a second copy of the preview on the right with the panel
// below it. `<slot name="aside">` fills that panel (BlExercise puts the task, hint and solution
// there). Every edit re-runs the preview after a short pause in typing.
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useSlots,
  watch,
} from 'vue';
import type { Game } from '@blacklight/core';
import type { ProjectFiles, RenderReport } from '../../../runner/protocol';
import type { Check } from '../../../examples/tutorials/check';
import { changedLineNumbers } from '../diff';
import { loadExample } from '../examples';
import CodePane from './CodePane.vue';
import RunnerFrame from './RunnerFrame.vue';

const props = withDefaults(
  defineProps<{
    src: string;
    /** One line under the preview: what to try. */
    hint?: string;
    /** Example loaded by the "Solution" button (exercises). */
    solution?: string;
    /** Polled while the preview runs; `done` is emitted once it passes. */
    check?: Check;
    /** Text of the button that opens the code. */
    label?: string;
  }>(),
  { hint: '', solution: undefined, check: undefined, label: '' },
);
const emit = defineEmits<{ done: [done: boolean] }>();

const DEBOUNCE_MS = 600;
const root = ref<HTMLElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
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
const runner = ref<InstanceType<typeof RunnerFrame> | null>(null);
const dialogRunner = ref<InstanceType<typeof RunnerFrame> | null>(null);
/** The code is open full screen. */
const open = ref(false);
/** The files shown come from the solution (until Revert, Reset or an edit). */
const showingSolution = ref(false);
/** The reader's own files, kept while the solution is shown. */
const stash = ref<ProjectFiles>();
const done = ref(false);
const slots = useSlots();
const hasPanel = computed(() => !!slots.aside || !!props.hint || !!props.solution);
const openLabel = computed(() => props.label || (props.solution ? 'Open exercise' : 'View code'));
const changed = computed(
  () =>
    !!files.value &&
    !!original.value &&
    editable.value.some((path) => files.value![path] !== original.value![path]),
);
/** Lines of the file on screen that the solution changed, while it is shown. */
const highlight = computed(() =>
  showingSolution.value
    ? changedLineNumbers(stash.value?.[active.value] ?? '', files.value?.[active.value] ?? '')
    : [],
);
let poll: ReturnType<typeof setInterval> | undefined;
/** Runs started so far, for tests waiting for the next one. */
const started = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;
let observer: IntersectionObserver | undefined;

function onChange(path: string, text: string) {
  if (!files.value || files.value[path] === text) return;
  // Typing makes the code the reader's own again: nothing left to revert to.
  showingSolution.value = false;
  stash.value = undefined;
  setDone(false);
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
  watchCheck();
}

function setDone(value: boolean) {
  if (done.value === value) return;
  done.value = value;
  emit('done', value);
}

/** The frame on screen: the dialog's when it is open, the page's otherwise. */
function activeRunner() {
  return (open.value ? dialogRunner.value : runner.value)?.window() as
    (Window & { blacklight?: Game }) | undefined;
}

/** Polls the check while the preview runs; a run that passed it once stays done. */
function watchCheck() {
  clearInterval(poll);
  poll = undefined;
  if (!props.check || status.value !== 'running' || done.value) return;
  poll = setInterval(() => {
    const window = activeRunner();
    let passed = false;
    try {
      passed = !!window?.blacklight && props.check!.done(window.blacklight, window.document);
    } catch {
      // The reader's code may leave the game half built: not done yet.
    }
    if (!passed) return;
    setDone(true);
    clearInterval(poll);
  }, 250);
}

/** Loads the solution, keeping the reader's code for Revert; called again, it reverts. */
async function toggleSolution() {
  if (!props.solution) return;
  if (showingSolution.value) {
    revertSolution();
    return;
  }
  const example = await loadExample(props.solution);
  setDone(false);
  stash.value = files.value;
  files.value = example.files;
  running.value = example.files;
  // Open the file the solution changed, so the highlighted lines are the first thing seen.
  const changed = example.editable.find((path) => example.files[path] !== stash.value?.[path]);
  if (changed) active.value = changed;
  else if (!example.editable.includes(active.value)) active.value = example.editable[0]!;
  showingSolution.value = true;
}

/** Puts the reader's code back, as it was when the solution was applied. */
function revertSolution() {
  if (!stash.value) return;
  setDone(false);
  files.value = stash.value;
  running.value = stash.value;
  stash.value = undefined;
  showingSolution.value = false;
}

function reset() {
  setDone(false);
  stash.value = undefined;
  files.value = original.value;
  running.value = original.value;
  showingSolution.value = false;
}

async function showCode() {
  if (!running.value) return;
  open.value = true;
  await nextTick();
  dialog.value?.focus();
}

function closeCode() {
  open.value = false;
  nextTick(() => root.value?.querySelector<HTMLElement>('.bl-live__open')?.focus());
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return;
  event.preventDefault();
  closeCode();
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
      if (!entry!.isIntersecting) {
        status.value = 'idle';
        watchCheck();
      }
    },
    { rootMargin: '400px 0px' },
  );
  observer.observe(root.value!);
});
// The page behind a full-screen dialog must not scroll.
watch(open, (value) => {
  document.documentElement.classList.toggle('bl-dialog-open', value);
  if (value) addEventListener('keydown', onKeydown);
  else removeEventListener('keydown', onKeydown);
  // The frame that just mounted starts a run of its own.
  watchCheck();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimeout(timer);
  clearInterval(poll);
  removeEventListener('keydown', onKeydown);
  document.documentElement.classList.remove('bl-dialog-open');
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
    :data-solution="showingSolution || undefined"
    :data-check="check ? 'true' : undefined"
    :data-done="check ? String(done) : undefined"
    :data-keys="check?.keys?.join(' ')"
  >
    <div class="bl-live__bar">
      <span class="bl-live__status" :class="`is-${status}`">{{
        status === 'idle' ? 'paused' : status
      }}</span>
      <button type="button" class="bl-live__open" aria-haspopup="dialog" @click="showCode">
        {{ openLabel }}
      </button>
    </div>
    <div class="bl-live__preview bl-preview">
      <RunnerFrame
        v-if="visible && running && !open"
        ref="runner"
        :files="running"
        mode="example"
        :run="runs"
        :title="`Preview of ${src}`"
        @status="onStatus"
      />
      <p v-else-if="!open" class="bl-live__placeholder">Preview starts when visible</p>
    </div>
    <figcaption v-if="error || hint" class="bl-live__caption">
      <pre v-if="error" class="bl-live__error">{{ error }}</pre>
      <span v-else>{{ hint }}</span>
    </figcaption>
  </figure>

  <Teleport to="body">
    <div
      v-if="open"
      ref="dialog"
      class="bl-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`Code of ${src}`"
      tabindex="-1"
      :data-status="status"
      :data-lit="report?.lit"
      :data-error="error || undefined"
      :data-run="started"
      :data-solution="showingSolution || undefined"
      :data-done="check ? String(done) : undefined"
    >
      <header class="bl-dialog__bar">
        <span class="bl-dialog__title">{{ src }}</span>
        <span class="bl-dialog__status" :class="`is-${status}`">{{ status }}</span>
        <div class="bl-dialog__actions">
          <button v-if="changed" type="button" class="bl-dialog__button" @click="reset">
            Reset
          </button>
          <button type="button" class="bl-dialog__button" @click="runs++">Run again</button>
          <button type="button" class="bl-dialog__close" aria-label="Close" @click="closeCode">
            ×
          </button>
        </div>
      </header>
      <div class="bl-dialog__body">
        <section class="bl-dialog__editor" aria-label="Code">
          <div class="bl-dialog__tabs" role="tablist">
            <button
              v-for="path in editable"
              :key="path"
              type="button"
              role="tab"
              class="bl-dialog__tab"
              :aria-selected="path === active"
              @click="active = path"
            >
              {{ path }}
            </button>
          </div>
          <CodePane
            v-if="running"
            class="bl-dialog__code"
            :path="active"
            :text="(files ?? running)[active] ?? ''"
            :highlight="highlight"
            @change="onChange"
          />
        </section>
        <section class="bl-dialog__side">
          <div class="bl-dialog__preview bl-preview">
            <RunnerFrame
              v-if="running"
              ref="dialogRunner"
              :files="running"
              mode="example"
              :run="runs"
              :title="`Preview of ${src}`"
              @status="onStatus"
            />
          </div>
          <div v-if="hasPanel" class="bl-dialog__panel vp-doc">
            <slot v-if="slots.aside" name="aside" />
            <p v-else class="bl-dialog__hint">{{ hint }}</p>
            <div v-if="solution" class="bl-dialog__solution">
              <button
                type="button"
                class="bl-dialog__solution-button"
                :class="{ 'is-revert': showingSolution }"
                @click="toggleSolution"
              >
                {{ showingSolution ? 'Revert' : 'Solution' }}
              </button>
            </div>
          </div>
          <pre v-if="error" class="bl-dialog__error">{{ error }}</pre>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* The card in the page: the preview, its state, and the way into the code. */
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
  gap: 12px;
  padding: 8px 12px;
  background: var(--bl-surface-high);
}
.bl-live__status,
.bl-dialog__status {
  flex: 1;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bl-outline);
}
.bl-live__status.is-running,
.bl-dialog__status.is-running {
  color: #ffffff;
}
.bl-live__status.is-error,
.bl-dialog__status.is-error {
  color: #f2b8b5;
}
.bl-live__open,
.bl-dialog__button,
.bl-dialog__tab,
.bl-dialog__close {
  border-radius: 999px;
  padding: 2px 14px;
  font-size: 13px;
  color: var(--bl-on-surface-variant);
  transition: background-color 0.2s var(--bl-ease);
}
.bl-live__open {
  background: #ffffff;
  color: #080808;
  font-weight: 600;
}
.bl-live__open:hover {
  background: #e6e6e6;
}
.bl-live__preview {
  aspect-ratio: 16 / 9;
  background: var(--bl-surface);
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
.bl-live__error,
.bl-dialog__error {
  margin: 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: #8c1d18;
  color: #f9dedc;
  font: 13px/1.5 var(--vp-font-family-mono);
  white-space: pre-wrap;
}

/* The full-screen dialog: editor on the left, preview over the panel on the right. */
.bl-dialog {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  padding: 12px 16px 16px;
  background: var(--bl-surface);
  outline: none;
}
.bl-dialog__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--bl-surface-container);
}
.bl-dialog__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 13px var(--vp-font-family-mono);
  color: var(--bl-on-surface);
}
.bl-dialog__status {
  flex: 0 1 auto;
  padding-left: 8px;
}
/* Actions and the close button on the right edge of the bar. */
.bl-dialog__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.bl-dialog__button {
  background: var(--bl-surface-high);
  font-weight: 600;
}
.bl-dialog__button:hover,
.bl-dialog__tab:hover,
.bl-dialog__close:hover {
  background: var(--bl-surface-highest);
  color: #ffffff;
}
.bl-dialog__close {
  padding: 2px 12px;
  font-size: 18px;
  line-height: 1.2;
}
.bl-dialog__body {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.bl-dialog__editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-radius: 20px;
  background: var(--bl-surface-container);
  overflow: hidden;
}
.bl-dialog__tabs {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  overflow-x: auto;
  background: var(--bl-surface-high);
}
.bl-dialog__tab {
  font-family: var(--vp-font-family-mono);
  white-space: nowrap;
}
.bl-dialog__tab[aria-selected='true'] {
  background: var(--bl-primary-container);
  color: #ffffff;
}
.bl-dialog__code {
  flex: 1;
  min-height: 0;
}
.bl-dialog__editor :deep(.cm-editor) {
  font-size: 14px;
}
.bl-dialog__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}
/* 16:9 like the games themselves: a taller box only adds black bars and takes room from the
   panel below. */
.bl-dialog__preview {
  flex: 0 0 auto;
  aspect-ratio: 16 / 9;
  border-radius: 20px;
  background: var(--bl-surface);
  overflow: hidden;
}
.bl-dialog__panel {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 18px 20px;
  border-radius: 20px;
  background: var(--bl-surface-container);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.bl-dialog__panel :deep(.custom-block.details) {
  background: var(--bl-surface-high);
  border-color: transparent;
}
.bl-dialog__hint {
  margin: 0;
  font-size: 14px;
  color: var(--bl-on-surface-variant);
}
/* The solution is a button below the task and the hint, not a block of code: applying it shows
   the changed lines in the editor, and it turns into Revert while it is applied. */
.bl-dialog__solution {
  margin-top: 20px;
}
.bl-dialog__solution-button {
  padding: 4px 18px;
  border-radius: 999px;
  background: #ffffff;
  color: #080808;
  font-size: 13px;
  font-weight: 600;
  transition: background-color 0.2s var(--bl-ease);
}
.bl-dialog__solution-button:hover {
  background: #e6e6e6;
}
.bl-dialog__solution-button.is-revert {
  background: var(--bl-surface-highest);
  color: var(--bl-on-surface);
}
.bl-dialog__solution-button.is-revert:hover {
  background: var(--bl-outline-variant);
}
@media (max-width: 900px) {
  .bl-dialog__body {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }
  .bl-dialog__editor {
    height: 50vh;
  }
  .bl-dialog__side {
    overflow: visible;
  }
  .bl-dialog__panel {
    flex: 0 0 auto;
  }
}
</style>
