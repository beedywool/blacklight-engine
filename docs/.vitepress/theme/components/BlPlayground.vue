<script setup lang="ts">
// The playground: a whole game project (config, scenes, objects, screens, animations, images)
// edited in the browser and run by the real engine. The project lives in the URL fragment, so the
// address bar is always a link to what is on screen.
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { ProjectFiles, RenderReport } from '../../../runner/protocol';
import { loadPlaygroundProject } from '../examples';
import { decodeProject, encodeProject } from '../share';
import CodePane from './CodePane.vue';
import RunnerFrame from './RunnerFrame.vue';

const DEBOUNCE_MS = 700;
const starter = shallowRef<ProjectFiles>({});
const files = shallowRef<ProjectFiles>({});
const running = shallowRef<ProjectFiles>();
const active = ref('');
const runs = ref(0);
const status = ref<'loading' | 'running' | 'error'>('loading');
const error = ref('');
const report = ref<RenderReport>();
const newPath = ref('');
const shareUrl = ref('');
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const paths = computed(() =>
  Object.keys(files.value).sort((a, b) => {
    const depth = (p: string) => (p.includes('/') ? 1 : 0);
    return depth(a) - depth(b) || a.localeCompare(b);
  }),
);
const isImage = (path: string) => /\.(png|jpe?g|webp|gif)$/.test(path);

async function remember(project: ProjectFiles) {
  const hash = await encodeProject(project);
  history.replaceState(history.state, '', hash);
  shareUrl.value = location.href;
}

function start(project: ProjectFiles) {
  files.value = project;
  running.value = project;
  if (!project[active.value])
    active.value =
      project['scenes/main/main.scene.ts'] !== undefined
        ? 'scenes/main/main.scene.ts'
        : paths.value[0]!;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    running.value = files.value;
    void remember(files.value);
  }, DEBOUNCE_MS);
}

function onChange(path: string, text: string) {
  if (files.value[path] === text) return;
  files.value = { ...files.value, [path]: text };
  schedule();
}

function onStatus(next: 'loading' | 'running' | 'error', detail?: RenderReport | string) {
  if (status.value === 'error' && next === 'running') return;
  status.value = next;
  if (next === 'loading') error.value = '';
  if (next === 'error' && !error.value) error.value = String(detail);
  if (next === 'running') report.value = detail as RenderReport;
}

function addFile() {
  const path = newPath.value.trim().replace(/^\/+/, '');
  if (!path || files.value[path] !== undefined) return;
  files.value = { ...files.value, [path]: path.endsWith('.json') ? '{}\n' : '' };
  active.value = path;
  newPath.value = '';
  schedule();
}

function removeFile(path: string) {
  const next = { ...files.value };
  delete next[path];
  files.value = next;
  if (active.value === path) active.value = paths.value[0] ?? '';
  schedule();
}

function replaceImage(path: string, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    files.value = { ...files.value, [path]: String(reader.result) };
    schedule();
  };
  reader.readAsDataURL(file);
}

async function share() {
  await remember(files.value);
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // No clipboard access (permissions, insecure origin): the link stays selectable below.
  }
}

async function reset() {
  start(starter.value);
  await remember(starter.value);
}

onMounted(async () => {
  starter.value = await loadPlaygroundProject();
  let project = starter.value;
  try {
    project = (await decodeProject(location.hash)) ?? starter.value;
  } catch (failure) {
    error.value = (failure as Error).message;
  }
  start(project);
  shareUrl.value = location.href;
});
</script>

<template>
  <div class="bl-play" :data-status="status" :data-error="error || undefined">
    <aside class="bl-play__files" aria-label="Project files">
      <ul>
        <li v-for="path in paths" :key="path" :class="{ 'is-active': path === active }">
          <button type="button" class="bl-play__file" :title="path" @click="active = path">
            {{ path }}
          </button>
          <button
            v-if="path !== 'game.config.ts'"
            type="button"
            class="bl-play__remove"
            :aria-label="`Delete ${path}`"
            @click="removeFile(path)"
          >
            ×
          </button>
        </li>
      </ul>
      <form class="bl-play__add" @submit.prevent="addFile">
        <input
          v-model="newPath"
          placeholder="objects/coin/coin.object.ts"
          aria-label="New file path"
        />
        <button type="submit">Add</button>
      </form>
    </aside>
    <section class="bl-play__editor">
      <div class="bl-play__bar">
        <span class="bl-play__path">{{ active }}</span>
        <span class="bl-play__status" :class="`is-${status}`">{{ status }}</span>
        <button type="button" @click="runs++">Run again</button>
        <button type="button" @click="reset">Reset</button>
        <button type="button" class="is-primary" @click="share">
          {{ copied ? 'Link copied' : 'Share' }}
        </button>
      </div>
      <div v-if="active && isImage(active)" class="bl-play__image">
        <img :src="files[active]" :alt="active" />
        <label
          >Replace image <input type="file" accept="image/*" @change="replaceImage(active, $event)"
        /></label>
      </div>
      <CodePane
        v-else-if="active"
        class="bl-play__code"
        :path="active"
        :text="files[active] ?? ''"
        @change="onChange"
      />
    </section>
    <section class="bl-play__preview">
      <div class="bl-play__frame">
        <RunnerFrame
          v-if="running"
          :files="running"
          mode="project"
          :run="runs"
          title="Playground preview"
          @status="onStatus"
        />
      </div>
      <pre v-if="error" class="bl-play__error">{{ error }}</pre>
      <p v-else class="bl-play__hint">
        Click the preview to give it the keyboard. The address bar always holds a link to this
        project.
      </p>
      <input
        class="bl-play__link"
        :value="shareUrl"
        readonly
        aria-label="Link to this project"
        @focus="($event.target as HTMLInputElement).select()"
      />
    </section>
  </div>
</template>

<style scoped>
.bl-play {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  height: calc(100vh - var(--vp-nav-height) - 48px);
  min-height: 560px;
  padding: 16px 24px 24px;
}
@media (max-width: 1100px) {
  .bl-play {
    grid-template-columns: 1fr;
    height: auto;
  }
  .bl-play__editor {
    height: 480px;
  }
}
.bl-play__files,
.bl-play__editor,
.bl-play__preview {
  min-height: 0;
  border-radius: 20px;
  background: var(--bl-surface-container);
  overflow: hidden;
}
.bl-play__files {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
}
.bl-play__files ul {
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}
.bl-play__files li {
  display: flex;
  border-radius: 12px;
}
.bl-play__files li.is-active {
  background: var(--bl-primary-container);
}
.bl-play__file {
  flex: 1;
  min-width: 0;
  padding: 4px 10px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 13px var(--vp-font-family-mono);
  color: var(--bl-on-surface-variant);
}
li.is-active .bl-play__file {
  color: #ffffff;
}
.bl-play__remove {
  padding: 0 10px;
  color: var(--bl-outline);
}
.bl-play__remove:hover {
  color: #ffffff;
}
.bl-play__add {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.bl-play__add input,
.bl-play__link {
  flex: 1;
  min-width: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bl-surface);
  border: 1px solid var(--bl-outline-variant);
  color: var(--bl-on-surface);
  font: 12px var(--vp-font-family-mono);
}
.bl-play__add button,
.bl-play__bar button {
  padding: 2px 14px;
  border-radius: 999px;
  background: var(--bl-primary-container);
  color: var(--bl-on-surface);
  font-size: 13px;
  font-weight: 600;
  transition: background-color 0.2s var(--bl-ease);
}
.bl-play__bar button:hover,
.bl-play__add button:hover {
  background: var(--bl-surface-highest);
}
.bl-play__bar button.is-primary {
  background: #ffffff;
  color: #080808;
}
.bl-play__editor {
  display: flex;
  flex-direction: column;
}
.bl-play__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bl-surface-high);
}
.bl-play__path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 13px var(--vp-font-family-mono);
}
.bl-play__status {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bl-outline);
}
.bl-play__status.is-running {
  color: #ffffff;
}
.bl-play__status.is-error {
  color: #f2b8b5;
}
.bl-play__code {
  flex: 1;
}
.bl-play__image {
  display: grid;
  gap: 16px;
  place-items: center;
  flex: 1;
  padding: 24px;
  font-size: 14px;
}
.bl-play__image img {
  min-width: 128px;
  image-rendering: pixelated;
  background: repeating-conic-gradient(#222 0 25%, #181818 0 50%) 0 0 / 16px 16px;
}
.bl-play__preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.bl-play__frame {
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bl-surface);
}
.bl-play__hint {
  margin: 0;
  font-size: 14px;
  color: var(--bl-on-surface-variant);
}
.bl-play__error {
  margin: 0;
  padding: 8px 12px;
  max-height: 40%;
  overflow: auto;
  border-radius: 12px;
  background: #8c1d18;
  color: #f9dedc;
  font: 13px/1.5 var(--vp-font-family-mono);
  white-space: pre-wrap;
}
</style>
