<script setup lang="ts">
import { Button, useScreen } from '@blacklight/ui';

const screen = useScreen({ enter: 'fade', leave: 'fade' });
</script>

<template>
  <div class="menu">
    <h1 class="menu__title">Paused</h1>
    <Button autofocus @click="screen.close()">Resume</Button>
    <Button>Options</Button>
    <Button variant="danger">Quit</Button>
  </div>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  font-size: 12px;
}
.menu__title {
  margin: 0;
  font-size: 16px;
  color: #fff;
}
</style>
