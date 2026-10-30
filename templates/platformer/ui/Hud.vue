<script setup lang="ts">
import { Anchor, Counter, InputPrompt } from '@blacklight/ui';
import { progress } from './progress';
</script>

<template>
  <Anchor to="top-left" :offset="[32, 24]">
    <div class="hud-coins">
      <span class="hud-coins__icon" />
      <Counter :value="progress.coins" :duration="200" /><small>/ {{ progress.total }}</small>
    </div>
  </Anchor>
  <Anchor to="top" :offset="[0, 28]">
    <div class="hud-prompts">
      <InputPrompt action="jump" label="JUMP" :size="36" />
      <InputPrompt action="pause" label="PAUSE" :size="36" />
    </div>
  </Anchor>
</template>

<style scoped>
.hud-coins {
  display: flex;
  align-items: center;
  gap: 12px;
  font: 40px var(--bl-font-display);
  color: #fff;
  text-shadow: 0 3px 0 #15171e;
}
.hud-coins small {
  font-size: 0.6em;
  opacity: 0.8;
}
.hud-coins__icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #ffd60a;
  box-shadow:
    inset -5px 0 0 #c89600,
    0 0 0 4px #15171e;
}
.hud-prompts {
  display: flex;
  gap: 32px;
  font: 24px var(--bl-font-display);
  color: #fff;
  text-shadow: 0 2px 0 #15171e;
}
</style>
