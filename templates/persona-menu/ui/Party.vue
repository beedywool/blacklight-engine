<script setup lang="ts">
import { Counter, Gauge, InputPrompt, ScrollList, Skew, useScreen } from '@blacklight/ui';

useScreen({ enter: 'slide-left', leave: 'slide-right' });
const party = [
  { name: 'JOKER', level: 42, hp: 380, maxHp: 412, sp: 120, maxSp: 160 },
  { name: 'SKULL', level: 40, hp: 210, maxHp: 398, sp: 40, maxSp: 98 },
  { name: 'PANTHER', level: 41, hp: 330, maxHp: 340, sp: 150, maxSp: 190 },
  { name: 'FOX', level: 39, hp: 290, maxHp: 352, sp: 88, maxSp: 120 },
];
const links = Array.from({ length: 60 }, (_, i) => ({
  name: `Confidant ${i + 1}`,
  rank: ((i * 7) % 10) + 1,
}));
</script>

<template>
  <div class="party">
    <h1 class="party__title">PARTY</h1>
    <div class="party__members">
      <div v-for="member in party" :key="member.name" class="party__member">
        <Skew color="#e60012" shadow="#000" class="party__name"
          >{{ member.name }} <small>Lv <Counter :value="member.level" /></small
        ></Skew>
        <Gauge :value="member.hp" :max="member.maxHp">HP {{ member.hp }}</Gauge>
        <Gauge :value="member.sp" :max="member.maxSp" color="#4aa8ff">SP {{ member.sp }}</Gauge>
      </div>
    </div>
    <ScrollList class="party__links" :items="links" :item-height="64" :height="640">
      <template #default="{ item }">
        <div class="party__link">
          <span>{{ item.name }}</span
          ><span>RANK {{ item.rank }}</span>
        </div>
      </template>
    </ScrollList>
    <div class="party__prompts"><InputPrompt action="back" label="BACK" :size="44" /></div>
  </div>
</template>

<style scoped>
.party {
  position: absolute;
  inset: 0;
  background: #111;
}
.party__title {
  margin: 60px 120px 40px;
  font: 400 120px/1 var(--bl-font-display);
  color: #fff;
  transform: rotate(-4deg);
}
.party__members {
  position: absolute;
  left: 160px;
  top: 260px;
  display: grid;
  gap: 28px;
  width: 640px;
}
.party__member {
  display: grid;
  gap: 8px;
}
.party__name {
  justify-self: start;
  font: 44px var(--bl-font-display);
}
.party__name small {
  font-size: 0.55em;
}
.party__links {
  position: absolute;
  right: 160px;
  top: 260px;
  width: 720px;
  background: rgba(255, 255, 255, 0.06);
}
.party__link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 28px;
  font: 32px var(--bl-font-display);
}
.party__prompts {
  position: absolute;
  right: 120px;
  bottom: 70px;
  font: 32px var(--bl-font-display);
}
</style>
