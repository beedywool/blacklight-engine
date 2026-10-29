<script setup lang="ts">
import { InputPrompt, InventoryGrid, Tooltip, toast, useScreen } from '@blacklight/ui';

useScreen({ enter: 'slide-left', leave: 'slide-right' });
const items = [
  { name: 'Bead', text: 'Restores 50 HP' },
  { name: 'Soul Drop', text: 'Restores 20 SP' },
  { name: 'Revival Bead', text: 'Revives one ally' },
  null,
  { name: 'Smoke Ball', text: 'Escape from battle' },
  { name: 'Muscle Drink', text: 'Restores 50 HP, may cause injury' },
  null,
  null,
  { name: 'Lockpick', text: 'Opens a treasure chest' },
  null,
  null,
  null,
];
const use = (item: (typeof items)[number]) => item && toast(`Used ${item.name}`);
</script>

<template>
  <div class="items">
    <h1 class="items__title">ITEMS</h1>
    <InventoryGrid class="items__grid" :items="items" :columns="4" :cell-size="200" @select="use">
      <template #default="{ item }">
        <Tooltip v-if="item" :text="item.text" side="bottom"
          ><span class="items__name">{{ item.name }}</span></Tooltip
        >
      </template>
    </InventoryGrid>
    <div class="items__prompts">
      <InputPrompt action="confirm" label="USE" :size="44" /><InputPrompt
        action="back"
        label="BACK"
        :size="44"
      />
    </div>
  </div>
</template>

<style scoped>
.items {
  position: absolute;
  inset: 0;
  background: #111;
}
.items__title {
  margin: 60px 120px 40px;
  font: 400 120px/1 var(--bl-font-display);
  color: var(--bl-color-primary);
  transform: rotate(-4deg);
}
.items__grid {
  margin-left: 160px;
}
.items__name {
  display: block;
  max-width: 180px;
  text-align: center;
  font: 30px/1.1 var(--bl-font-display);
}
.items__prompts {
  position: absolute;
  right: 120px;
  bottom: 70px;
  display: flex;
  gap: 48px;
  font: 32px var(--bl-font-display);
}
</style>
