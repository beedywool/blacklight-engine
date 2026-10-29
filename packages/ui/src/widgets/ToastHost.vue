<script setup lang="ts">
import { toasts } from './toast';
</script>

<template>
  <TransitionGroup tag="div" name="bl-toast" class="bl-toasts" aria-live="polite">
    <div v-for="item in toasts" :key="item.id" class="bl-toast" :class="`bl-toast--${item.kind}`">
      {{ item.message }}
    </div>
  </TransitionGroup>
</template>
