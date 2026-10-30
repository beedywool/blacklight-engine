<script setup lang="ts">
// The running preview: an iframe on the runner page, rebuilt for every run so each starts clean.
import { withBase } from 'vitepress';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  RUNNER_PATH,
  type ProjectFiles,
  type RenderReport,
  type RunnerMessage,
} from '../../../runner/protocol';

const props = defineProps<{
  files: ProjectFiles | undefined;
  mode: 'example' | 'project';
  /** Bumped by the parent to run again with the same files. */
  run: number;
  title: string;
}>();
const emit = defineEmits<{
  status: [status: 'loading' | 'running' | 'error', detail?: RenderReport | string];
}>();

const frame = ref<HTMLIFrameElement | null>(null);
const key = ref(0);
const src = ref('');
let pending: ProjectFiles | undefined;

function onMessage(event: MessageEvent<RunnerMessage>) {
  if (event.origin !== location.origin || event.source !== frame.value?.contentWindow) return;
  const message = event.data;
  if (message.type === 'blacklight:ready' && pending) {
    frame.value!.contentWindow!.postMessage(
      { type: 'blacklight:run', mode: props.mode, files: pending },
      location.origin,
    );
    pending = undefined;
  } else if (message.type === 'blacklight:running') emit('status', 'running', message.report);
  else if (message.type === 'blacklight:error') emit('status', 'error', message.message);
}

function restart() {
  if (!props.files) return;
  pending = JSON.parse(JSON.stringify(props.files)) as ProjectFiles;
  emit('status', 'loading');
  key.value++;
}

onMounted(() => {
  src.value = withBase(`/${RUNNER_PATH}`);
  addEventListener('message', onMessage);
  restart();
});
onBeforeUnmount(() => removeEventListener('message', onMessage));
watch(() => [props.files, props.run], restart);
</script>

<template>
  <iframe
    v-if="src"
    :key="key"
    ref="frame"
    class="bl-runner"
    :src="src"
    :title="title"
    allow="autoplay; gamepad; fullscreen"
  />
</template>

<style scoped>
.bl-runner {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #080808;
}
</style>
