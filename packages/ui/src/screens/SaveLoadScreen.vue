<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { onUiStep, useGame, useScreen, useUi } from '../composables';
import { vFocus } from '../directives';
import { t, useI18n } from '../i18n';
import type { SaveSlotInfo, SaveSlotMeta, SaveSlots } from '../slots';
import { toast } from '../widgets/toast';
import InputPrompt from '../components/InputPrompt.vue';

/**
 * Ready-made save / load screen (UI-17) over any {@link SaveSlots} implementation. Closes with
 * `'saved'`, `'loaded'` or `undefined` (back).
 */
const props = withDefaults(
  defineProps<{
    mode: 'save' | 'load';
    slots: SaveSlots;
    /** Number of numbered slots shown (`'1'`…`'n'`). Other filled slots (`auto`, `quick`) are listed first. */
    count?: number;
    /** Details stored with a new save (label, summary, thumbnail). */
    meta?: () => SaveSlotMeta | Promise<SaveSlotMeta>;
  }>(),
  { count: 8 },
);
const screen = useScreen({ enter: 'slide-up', leave: 'slide-down' });
const game = useGame();
const ui = useUi();
const i18n = useI18n();
const filled = shallowRef<SaveSlotInfo[]>([]);
const busy = shallowRef(false);
const focusedId = shallowRef<string | undefined>();

async function refresh() {
  try {
    filled.value = await props.slots.list();
  } catch (error) {
    toast(t('bl.slots.failed', { error: error instanceof Error ? error.message : String(error) }), {
      kind: 'error',
    });
  }
}
onMounted(refresh);

const rows = computed(() => {
  const byId = new Map(filled.value.map((s) => [s.id, s]));
  const numbered = Array.from({ length: props.count }, (_, i) => String(i + 1));
  const extra = filled.value.filter((s) => !numbered.includes(s.id)).map((s) => s.id);
  // Automatic and quick saves can be loaded, never overwritten from this screen.
  const ids = props.mode === 'load' ? [...extra, ...numbered] : numbered;
  return ids.map((id) => ({ id, info: byId.get(id) }));
});

const date = (ms: number) =>
  new Intl.DateTimeFormat(i18n.locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

async function pick(id: string, info: SaveSlotInfo | undefined) {
  if (busy.value) return;
  try {
    if (props.mode === 'save') {
      if (info && !(await ui.confirm({ message: t('bl.slots.overwrite') }))) return;
      busy.value = true;
      await props.slots.save(id, (await props.meta?.()) ?? {});
      toast(t('bl.slots.saved'), { kind: 'success' });
      await refresh();
      screen.close('saved');
    } else {
      if (!info) return;
      if (!(await ui.confirm({ message: t('bl.slots.confirmLoad') }))) return;
      busy.value = true;
      screen.close('loaded');
      await props.slots.load(id);
    }
  } catch (error) {
    toast(t('bl.slots.failed', { error: error instanceof Error ? error.message : String(error) }), {
      kind: 'error',
    });
  } finally {
    busy.value = false;
  }
}

async function remove(id: string) {
  if (busy.value || !(await ui.confirm({ message: t('bl.slots.delete'), danger: true }))) return;
  await props.slots.delete(id);
  await refresh();
}

// The `action` button (X / Square / F) deletes the focused save.
onUiStep(
  () => {
    if (!game.input.uiPlayer(1).pressed('action') || !focusedId.value) return;
    if (filled.value.some((s) => s.id === focusedId.value)) void remove(focusedId.value);
  },
  { onlyOnTop: true },
);
</script>

<template>
  <div class="bl-slots" :data-mode="mode">
    <h1 class="bl-slots__title">{{ t(`bl.slots.${mode}`) }}</h1>
    <div class="bl-slots__grid" data-bl-focus-group="wrap">
      <div
        v-for="(row, i) in rows"
        :key="row.id"
        v-focus
        class="bl-slots__slot"
        :class="{ 'bl-slots__slot--empty': !row.info }"
        :data-slot="row.id"
        :data-bl-autofocus="i === 0 || undefined"
        :aria-disabled="(mode === 'load' && !row.info) || undefined"
        @click="pick(row.id, row.info)"
        @focus="focusedId = row.id"
        @pointerenter="focusedId = row.id"
      >
        <img v-if="row.info?.thumbnail" class="bl-slots__thumb" :src="row.info.thumbnail" alt="" />
        <div v-else class="bl-slots__thumb bl-slots__thumb--blank" />
        <div class="bl-slots__info">
          <span class="bl-slots__id">{{
            /^\d+$/.test(row.id) ? t('bl.slots.slot', { n: Number(row.id) }) : row.id.toUpperCase()
          }}</span>
          <template v-if="row.info">
            <span class="bl-slots__label">{{ row.info.label }}</span>
            <span class="bl-slots__summary">{{ row.info.summary }}</span>
            <span class="bl-slots__date"
              >{{ date(row.info.savedAt)
              }}<template v-if="row.info.playTime !== undefined">
                · {{ duration(row.info.playTime) }}</template
              ></span
            >
          </template>
          <span v-else class="bl-slots__summary">{{ t('bl.slots.empty') }}</span>
        </div>
      </div>
    </div>
    <div class="bl-slots__prompts">
      <InputPrompt action="action" :label="t('bl.slots.deleteHint')" :size="40" />
      <InputPrompt action="back" :label="t('bl.common.back')" :size="40" />
    </div>
  </div>
</template>
