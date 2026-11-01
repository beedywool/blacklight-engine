<script setup lang="ts">
// <BlExercise src="tutorials/camera/1-follow">task, hint and solution</BlExercise>: a live example
// in the page whose code dialog carries the check, the task, the hint and the solution (the slot)
// in the panel under the preview. When the tutorial's checks.ts has a check for it, its status line
// turns to "Done" once the running example passes.
import { computed, ref } from 'vue';
import { checkOf } from '../exercises';
import LiveExample from './LiveExample.vue';

const props = defineProps<{ src: string }>();
const check = computed(() => checkOf(props.src));
const done = ref(false);
</script>

<template>
  <section class="bl-exercise" :data-exercise="src" :data-done="check ? String(done) : undefined">
    <LiveExample
      :src="src"
      :solution="`${src}.solution`"
      :check="check"
      label="Open exercise"
      @done="done = $event"
    >
      <template #aside>
        <p v-if="check" class="bl-exercise__status" :class="{ 'is-done': done }" role="status">
          <span class="bl-exercise__mark" aria-hidden="true">{{ done ? '✓' : '' }}</span>
          <strong>{{ done ? 'Done' : 'Checking' }}</strong>
          <span>{{ check.goal }}</span>
        </p>
        <slot />
      </template>
    </LiveExample>
  </section>
</template>

<style scoped>
.bl-exercise {
  margin: 24px 0 40px;
}
.bl-exercise__status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--bl-surface-high);
  color: var(--bl-on-surface-variant);
  font-size: 14px;
  transition: background-color 0.3s var(--bl-ease);
}
.bl-exercise__status strong {
  color: var(--bl-outline);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
}
.bl-exercise__mark {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--bl-outline);
  font-size: 12px;
  line-height: 1;
}
.bl-exercise__status.is-done {
  background: #ffffff;
  color: #080808;
}
.bl-exercise__status.is-done strong {
  color: #080808;
}
.bl-exercise__status.is-done .bl-exercise__mark {
  border-color: #080808;
  background: #080808;
  color: #ffffff;
}
</style>
