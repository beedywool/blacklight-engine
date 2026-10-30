<script setup lang="ts">
import { InputPrompt, onUiStep, useGame, useUi, useUiRuntime } from '@blacklight/ui';
import { computed, reactive, shallowRef } from 'vue';
import SkinBadge from '@ui/SkinBadge.vue';
import { SKINS } from '../../../party/skins';
import {
  addProfile,
  displayName,
  party,
  profiles,
  startParty,
  type Identity,
  type PartyMember,
} from '../../../party/session';
import NewProfile from './NewProfile.vue';

/** Steps between "everybody is ready" and the game select screen. */
const START_DELAY = 45;
const MAX_PLAYERS = 8;

interface Slot {
  joined: boolean;
  /** Index in the identity choices. */
  choice: number;
  skin: number;
  ready: boolean;
}

const game = useGame();
const ui = useUi();
const runtime = useUiRuntime();
const accounts = game.modules['accounts-oidc'];

// Coming back from the game select screen keeps the party as it was.
const slots = reactive<Slot[]>(
  Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    joined: i === 0 || game.input.player(i + 1).joined,
    choice: 0,
    skin: party.members.find((m) => m.player === i + 1)?.skin ?? i,
    ready: false,
  })),
);
const profileList = shallowRef(profiles(game));
const starting = shallowRef(0);
let busy = false;
const unarmed = new Set<number>();

/** What a player can play as: guest, a local profile, the signed-in account, or a new profile. */
type Choice = Identity | { kind: 'new' };
const choices = computed<Choice[]>(() => [
  { kind: 'guest' },
  ...profileList.value.map((p) => ({ kind: 'profile' as const, name: p.name })),
  ...(accounts.user
    ? [{ kind: 'account' as const, name: (accounts.user.name ?? 'ACCOUNT').toUpperCase() }]
    : []),
  { kind: 'new' },
]);

for (const member of party.members) {
  const { identity } = member;
  const index = choices.value.findIndex(
    (c) =>
      c.kind === identity.kind &&
      (!('name' in c) || ('name' in identity && c.name === identity.name)),
  );
  if (slots[member.player - 1]?.joined && index >= 0) slots[member.player - 1]!.choice = index;
}

function identityOf(index: number): Choice {
  return choices.value[slots[index]!.choice] ?? { kind: 'guest' };
}

/** A profile or the account can be used by one player at a time. */
function taken(choice: Choice, index: number): boolean {
  if (choice.kind !== 'profile' && choice.kind !== 'account') return false;
  return slots.some(
    (slot, i) =>
      i !== index &&
      slot.joined &&
      (() => {
        const other = identityOf(i);
        return other.kind === choice.kind && 'name' in other && other.name === choice.name;
      })(),
  );
}

function cycle(index: number, step: number): void {
  const slot = slots[index]!;
  const count = choices.value.length;
  for (let i = 1; i <= count; i++) {
    const next = (slot.choice + step * i + count * count) % count;
    if (!taken(choices.value[next]!, index)) {
      slot.choice = next;
      return;
    }
  }
}

function label(index: number): string {
  const choice = identityOf(index);
  if (choice.kind === 'new') return '+ NEW PROFILE';
  if (choice.kind === 'account') return `★ ${choice.name}`;
  return displayName({ player: index + 1, identity: choice });
}

function stats(index: number): string {
  const choice = identityOf(index);
  if (choice.kind === 'account') return 'BLACKLIGHT ACCOUNT';
  if (choice.kind !== 'profile')
    return choice.kind === 'new' ? 'CONFIRM TO NAME IT' : 'NO STATS KEPT';
  const profile = profileList.value.find((p) => p.name === choice.name);
  return `${profile?.wins ?? 0} WINS · ${profile?.points ?? 0} PTS`;
}

async function createProfile(index: number): Promise<void> {
  busy = true;
  const name = await ui.modal<string>(NewProfile);
  busy = false;
  if (!name) return;
  addProfile(game, name);
  profileList.value = profiles(game);
  slots[index]!.choice = choices.value.findIndex((c) => c.kind === 'profile' && c.name === name);
}

function freeSkin(): number {
  const used = new Set(slots.filter((s) => s.joined).map((s) => s.skin));
  return SKINS.findIndex((_, i) => !used.has(i));
}

function start(): void {
  const members: PartyMember[] = slots.flatMap((slot, i) => {
    if (!slot.joined) return [];
    const choice = identityOf(i);
    const identity: Identity = choice.kind === 'new' ? { kind: 'guest' } : choice;
    return [{ player: i + 1, skin: slot.skin, identity, name: '' }];
  });
  startParty(members);
  void game.goto('game-select', undefined, { transition: 'slash' });
}

onUiStep(() => {
  if (busy || starting.value < 0) return;
  const input = game.input;
  const fresh = input.join('confirm', MAX_PLAYERS);
  if (fresh) {
    const slot = slots[fresh.number - 1]!;
    Object.assign(slot, { joined: true, choice: 0, ready: false, skin: Math.max(0, freeSkin()) });
    unarmed.add(fresh.number);
    runtime.sound('confirm');
    // Player 1 read every pad until now: this press was the join, not player 1's.
    return;
  }
  for (const player of input.joinedPlayers) {
    const index = player.number - 1;
    const slot = slots[index]!;
    slot.joined = true;
    const pad = input.uiPlayer(player.number);
    // A new player's buttons count once the join button is released.
    if (unarmed.has(player.number)) {
      if (!pad.held('confirm')) unarmed.delete(player.number);
      continue;
    }
    if (slot.ready) {
      if (pad.pressed('back')) {
        slot.ready = false;
        runtime.sound('back');
      }
      continue;
    }
    if (pad.pressed('left') || pad.pressed('right')) {
      cycle(index, pad.pressed('left') ? -1 : 1);
      runtime.sound('move');
    }
    if (pad.pressed('up') || pad.pressed('down')) {
      slot.skin = (slot.skin + (pad.pressed('up') ? SKINS.length - 1 : 1)) % SKINS.length;
      runtime.sound('move');
    }
    if (pad.pressed('confirm')) {
      if (identityOf(index).kind === 'new') void createProfile(index);
      else slot.ready = true;
      runtime.sound('confirm');
    } else if (pad.pressed('back')) {
      runtime.sound('back');
      if (player.number === 1) {
        starting.value = -1;
        void game.goto('title', undefined, { transition: 'fade' });
        return;
      }
      input.leave(player.number);
      Object.assign(slot, { joined: false, ready: false, choice: 0 });
    }
  }
  const joined = slots.filter((s) => s.joined);
  if (joined.length > 0 && joined.every((s) => s.ready)) {
    if (++starting.value >= START_DELAY) {
      starting.value = -1;
      start();
    }
  } else {
    starting.value = 0;
  }
});
</script>

<template>
  <div class="join">
    <h1 class="join__title">WHO'S PLAYING?</h1>
    <p class="join__help">
      Player 1 uses the keyboard or the first gamepad. More players: press
      <InputPrompt action="confirm" device="gamepad" :size="40" /> on another gamepad.
    </p>
    <div class="join__slots">
      <div
        v-for="(slot, i) in slots"
        :key="i"
        class="slot"
        :class="{ 'slot--joined': slot.joined, 'slot--ready': slot.ready }"
        :data-player="i + 1"
      >
        <span class="slot__number">P{{ i + 1 }}</span>
        <template v-if="slot.joined">
          <SkinBadge class="slot__skin" :skin="slot.skin" :size="150" />
          <span class="slot__skin-name">▲ {{ SKINS[slot.skin]!.name }} ▼</span>
          <span class="slot__name">‹ {{ label(i) }} ›</span>
          <span class="slot__stats">{{ stats(i) }}</span>
          <span v-if="slot.ready" class="slot__ready">READY!</span>
        </template>
        <span v-else class="slot__empty"
          >PRESS <InputPrompt action="confirm" device="gamepad" :size="44" /> TO JOIN</span
        >
      </div>
    </div>
    <div v-if="starting > 0" class="join__starting">GET READY…</div>
    <div class="join__prompts">
      <InputPrompt action="left" label="PROFILE" :size="40" />
      <InputPrompt action="up" label="SKIN" :size="40" />
      <InputPrompt action="confirm" label="READY" :size="40" />
      <InputPrompt action="back" label="LEAVE" :size="40" />
    </div>
  </div>
</template>

<style scoped>
.join {
  position: absolute;
  inset: 0;
  color: #fff;
}
.join__title {
  position: absolute;
  left: 110px;
  top: 40px;
  margin: 0;
  font: 400 110px/1 var(--bl-font-display);
  transform: rotate(-3deg);
  -webkit-text-stroke: 6px #111;
  paint-order: stroke fill;
}
.join__help {
  position: absolute;
  left: 120px;
  top: 170px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font: 28px var(--bl-font-body);
  color: #ccc;
}
.join__slots {
  position: absolute;
  left: 110px;
  right: 110px;
  top: 240px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 28px;
}
.slot {
  position: relative;
  height: 330px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #1f1f27;
  border: 4px solid #33333f;
  transform: skewX(var(--bl-skew));
}
.slot--joined {
  background: #111;
  border-color: #fff;
}
.slot--ready {
  border-color: var(--bl-color-primary);
  box-shadow: 10px 10px 0 var(--bl-color-primary);
}
.slot__number {
  position: absolute;
  left: 16px;
  top: 8px;
  font: 40px var(--bl-font-display);
  color: var(--bl-color-primary);
}
.slot__skin-name,
.slot__stats {
  font: 22px var(--bl-font-body);
  color: #aaa;
}
.slot__name {
  font: 36px var(--bl-font-display);
}
.slot__ready {
  position: absolute;
  right: -10px;
  bottom: 18px;
  padding: 4px 18px;
  background: var(--bl-color-primary);
  font: 44px var(--bl-font-display);
  transform: rotate(-8deg);
}
.slot__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 28px var(--bl-font-display);
  color: #777;
}
.join__starting {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 120px;
  text-align: center;
  font: 64px var(--bl-font-display);
  color: #ffd60a;
}
.join__prompts {
  position: absolute;
  right: 110px;
  bottom: 50px;
  display: flex;
  gap: 40px;
  font: 28px var(--bl-font-display);
}
</style>
