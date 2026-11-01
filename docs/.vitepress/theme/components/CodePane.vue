<script setup lang="ts">
// A CodeMirror editor showing one file at a time; the parent owns the file contents.
import type { EditorView } from '@codemirror/view';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ path: string; text: string; highlight?: number[] }>();
const emit = defineEmits<{ change: [path: string, text: string] }>();

const host = ref<HTMLElement | null>(null);
let view: EditorView | undefined;
let editor: Awaited<ReturnType<typeof loadEditor>> | undefined;
const loadEditor = () => import('../editor');
let shown = '';

async function open() {
  editor ??= await loadEditor();
  view?.destroy();
  shown = props.text;
  const path = props.path;
  view = editor.createEditor(host.value!, path, props.text, (text) => {
    shown = text;
    emit('change', path, text);
  });
  editor.setHighlight(view, props.highlight ?? []);
}

onMounted(open);
onBeforeUnmount(() => view?.destroy());
watch(() => props.path, open);
// Lines marked from outside (the solution of an exercise, then reverted).
watch(
  () => props.highlight,
  (lines) => {
    if (view && editor) editor.setHighlight(view, lines ?? []);
  },
);
// Text replaced from outside (reset, shared link): show it.
watch(
  () => props.text,
  (text) => {
    if (view && editor && text !== shown) {
      shown = text;
      editor.setText(view, text);
    }
  },
);
</script>

<template>
  <div ref="host" class="bl-code" />
</template>

<style scoped>
.bl-code {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.bl-code :deep(.cm-editor) {
  height: 100%;
}
.bl-code :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
