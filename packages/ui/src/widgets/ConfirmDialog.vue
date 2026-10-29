<script setup lang="ts">
import { useScreen } from '../composables';
import Button from './Button.vue';
import FocusGroup from '../components/FocusGroup.vue';

defineProps<{
  title?: string;
  message: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}>();
const screen = useScreen();
</script>

<template>
  <div class="bl-dialog" role="alertdialog" :aria-label="title ?? message">
    <h2 v-if="title" class="bl-dialog__title">{{ title }}</h2>
    <p class="bl-dialog__message">{{ message }}</p>
    <FocusGroup class="bl-dialog__actions" axis="x" trap wrap>
      <Button variant="secondary" autofocus @click="screen.close(false)">{{
        cancel ?? 'Cancel'
      }}</Button>
      <Button :variant="danger ? 'danger' : 'primary'" @click="screen.close(true)">{{
        confirm ?? 'Confirm'
      }}</Button>
    </FocusGroup>
  </div>
</template>
