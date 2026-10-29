<script setup lang="ts">
import { Anchor, Gauge, InputPrompt, Skew } from '@blacklight/ui';

const party = [
  { name: 'JOKER', hp: 380, max: 412 },
  { name: 'SKULL', hp: 210, max: 398 },
];
</script>

<template>
  <Anchor to="top-left" :offset="[40, 40]">
    <div class="hud-party">
      <div v-for="member in party" :key="member.name" class="hud-member">
        <Skew color="#111" shadow="#e60012">{{ member.name }}</Skew>
        <Gauge :value="member.hp" :max="member.max" class="hud-gauge">{{ member.hp }}</Gauge>
      </div>
    </div>
  </Anchor>
  <Anchor to="bottom-right" :offset="[48, 40]">
    <div class="hud-prompt"><InputPrompt action="pause" label="MENU" :size="48" /></div>
  </Anchor>
</template>

<style scoped>
.hud-party {
  display: flex;
  flex-direction: column;
  gap: 18px;
  font: 34px var(--bl-font-display);
}
.hud-member {
  display: flex;
  align-items: center;
  gap: 16px;
}
.hud-gauge {
  width: 260px;
}
.hud-prompt {
  font: 36px var(--bl-font-display);
  color: #fff;
}
</style>
