<script setup lang="ts">
import { Button, TextInput, t, useScreen } from '@blacklight/ui';
import { ref } from 'vue';

// A modal: closes with the name (IME composition works for Japanese and Chinese names).
const screen = useScreen({ enter: 'zoom', leave: 'fade' });
const name = ref(t('name.default'));

function start() {
  const value = name.value.trim();
  screen.close(value || t('name.default'));
}
</script>

<template>
  <div class="bl-dialog name-entry">
    <h2 class="bl-dialog__title">{{ t('name.title') }}</h2>
    <TextInput v-model="name" :label="t('name.label')" :max-length="16" @submit="start" />
    <div class="bl-dialog__actions">
      <Button class="name-entry__start" @click="start">{{ t('name.start') }}</Button>
    </div>
  </div>
</template>

<style scoped>
.name-entry {
  display: grid;
  gap: 24px;
}
</style>
