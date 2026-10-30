<script setup lang="ts">
import { Button, TextInput, useScreen } from '@blacklight/ui';
import { ref } from 'vue';

// A modal that closes with the new profile's name (or nothing on back).
const screen = useScreen({ enter: 'zoom', leave: 'fade' });
const name = ref('');

function create() {
  const value = name.value.trim().toUpperCase();
  if (value) screen.close(value);
}
</script>

<template>
  <div class="bl-dialog new-profile">
    <h2 class="bl-dialog__title">NEW PROFILE</h2>
    <TextInput v-model="name" label="NAME" placeholder="ACE" :max-length="12" @submit="create" />
    <div class="bl-dialog__actions">
      <Button @click="create">CREATE</Button>
    </div>
  </div>
</template>

<style scoped>
.new-profile {
  display: grid;
  gap: 24px;
}
</style>
