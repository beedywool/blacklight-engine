# Save and continue

Most games need three things: a "Continue" entry on the title menu that appears once a save exists, a save written without asking the player, and a new game that starts clean. `game.save` covers all three.

```ts
// game.config.ts
export default defineConfig({
  // …
  save: { autosave: { interval: 120, onSceneChange: true } },
});
```

With `autosave`, the `'auto'` slot is written on every scene change and every 2 minutes of play (game time: a paused game does not save). Nothing is written while `save.data` is empty, so the title screen does not create a save by itself.

```vue
<!-- ui/TitleMenu.vue -->
<script setup lang="ts">
import { MenuList, useGame } from '@blacklight/ui';
import { computed, onMounted, ref } from 'vue';

const game = useGame();
const hasSave = ref(false);
onMounted(async () => (hasSave.value = await game.save.exists('auto')));

const items = computed(() => [
  { label: 'CONTINUE', value: 'continue', disabled: !hasSave.value },
  { label: 'NEW GAME', value: 'new' },
]);

async function select(value: string) {
  if (value === 'continue') {
    await game.save.load('auto');
    await game.goto(game.save.data.scene ?? 'field', undefined, { transition: 'fade' });
  } else {
    game.save.reset({ scene: 'field', coins: 0 });
    await game.goto('field', undefined, { transition: 'fade' });
  }
}
</script>

<template>
  <MenuList :items="items" @select="select" />
</template>
```

```ts
// anywhere in the game: the type of save.data
declare module '@blacklight/core' {
  interface SaveData {
    scene?: string;
    coins: number;
  }
}
```

Game code changes `game.save.data` directly (`this.game.save.data.coins++`); the next autosave or `save()` writes it. Objects that must come back exactly where they were (positions, enemies alive) can be stored as a [scene snapshot](../guide/snapshots) in the data.

A save modified outside the game fails to load with `SaveError` code `tampered`, and the previous version can be loaded instead: the [Saves](../guide/saves) guide shows that dialog, the slot list for a save/load screen, and password-protected export to move saves between devices.
