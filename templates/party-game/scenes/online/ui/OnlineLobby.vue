<script setup lang="ts">
import type { RelayClient, RoomState } from '@blacklight/net';
import { Button, InputPrompt, Select, TextInput, onUiStep, toast, useGame } from '@blacklight/ui';
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import {
  MINI_GAMES,
  defaultSettings,
  miniGame,
  type MiniGameId,
  type MiniGameSettings,
} from '../../../party/catalog';
import { canStart, connect, disconnect, host, roomGame, savedRelay } from '../../../party/online';
import { accountsOf } from '../../../party/accounts';

type Stage = 'connect' | 'host' | 'room';

const game = useGame();
const accounts = accountsOf(game);
const stage = shallowRef<Stage>('connect');
const address = ref(savedRelay(game));
const name = ref((accounts?.user?.name ?? 'PLAYER').toUpperCase().slice(0, 16));
const code = ref('');
const busy = shallowRef(false);
const relay = shallowRef<RelayClient>();
const room = shallowRef<RoomState>();
const choice = ref<MiniGameId>('push-push');
const settings = ref<MiniGameSettings>(defaultSettings('push-push'));
const games = MINI_GAMES.map((g) => ({ label: g.title, value: g.scene }));
const chosen = computed(() => miniGame(choice.value));
const roomInfo = computed(() => (room.value ? roomGame(room.value) : undefined));
const isHost = computed(() => !!room.value && room.value.host === relay.value?.member);
const me = computed(() => room.value?.members.find((m) => m.id === relay.value?.member));
const startable = computed(() => {
  void room.value;
  return relay.value && roomInfo.value
    ? canStart(relay.value, Math.max(2, miniGame(roomInfo.value.game).minPlayers))
    : false;
});

function pick(id: MiniGameId) {
  choice.value = id;
  settings.value = defaultSettings(id);
}

async function open(): Promise<RelayClient | undefined> {
  busy.value = true;
  try {
    const client = await connect(game, address.value, name.value);
    relay.value = client;
    client.events.on('room', (state) => (room.value = state));
    client.events.on('close', () => {
      if (relay.value !== client) return;
      toast('Disconnected from the relay.', { kind: 'error' });
      reset();
    });
    return client;
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { kind: 'error' });
    return undefined;
  } finally {
    busy.value = false;
  }
}

async function createRoom() {
  const client = relay.value ?? (await open());
  if (!client) return;
  busy.value = true;
  try {
    room.value = await host(
      client,
      { game: choice.value, settings: [...settings.value] },
      chosen.value.maxPlayers,
    );
    stage.value = 'room';
    void client.match().then(play);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { kind: 'error' });
  } finally {
    busy.value = false;
  }
}

async function join() {
  if (!code.value.trim()) return;
  const client = await open();
  if (!client) return;
  busy.value = true;
  try {
    room.value = await client.joinRoom(code.value);
    stage.value = 'room';
    void client.match().then(play);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { kind: 'error' });
  } finally {
    busy.value = false;
  }
}

function toggleReady() {
  relay.value?.setReady(!me.value?.ready);
}

async function start() {
  try {
    await relay.value?.start();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), { kind: 'error' });
  }
}

let leaving = false;
function play(match: Awaited<ReturnType<RelayClient['match']>>) {
  if (leaving || !roomInfo.value) return;
  leaving = true;
  const { game: id, settings: chosenSettings } = roomInfo.value;
  void game.goto(
    'match',
    { game: id, settings: chosenSettings, online: match },
    { transition: 'iris' },
  );
}

function reset() {
  relay.value = undefined;
  room.value = undefined;
  stage.value = 'connect';
}

function back() {
  if (stage.value === 'room') {
    disconnect();
    reset();
  } else if (stage.value === 'host') {
    stage.value = 'connect';
  } else {
    leaving = true;
    disconnect();
    void game.goto('title', undefined, { transition: 'fade' });
  }
}

onUiStep(
  () => {
    if (game.input.uiPlayer(1).pressed('back')) back();
  },
  { onlyOnTop: true },
);
onUnmounted(() => {
  // Leaving for the match keeps the connection: the match runs over it.
  if (!leaving) disconnect();
});
</script>

<template>
  <div class="lobby">
    <h1 class="lobby__title">ONLINE</h1>
    <section v-if="stage === 'connect'" class="lobby__panel">
      <TextInput v-model="address" class="lobby__address" label="RELAY" :max-length="120" />
      <TextInput v-model="name" class="lobby__name" label="NAME" :max-length="16" />
      <Button class="lobby__host" :disabled="busy" autofocus @click="stage = 'host'"
        >HOST A ROOM</Button
      >
      <div class="lobby__join">
        <TextInput
          v-model="code"
          class="lobby__code-input"
          label="CODE"
          placeholder="ABCD"
          :max-length="8"
          @submit="join"
        />
        <Button class="lobby__join-button" :disabled="busy || !code.trim()" @click="join"
          >JOIN</Button
        >
      </div>
      <p class="lobby__hint">
        Run a relay (<code>pnpm exec blacklight-relay</code> from <code>@blacklight/relay</code>, or
        its Docker image) or host one from the desktop app on the LAN. Every player connects to the
        same address.
      </p>
    </section>
    <section v-else-if="stage === 'host'" class="lobby__panel">
      <Select
        :model-value="choice"
        class="lobby__game"
        label="GAME"
        :options="games"
        @update:model-value="pick($event as MiniGameId)"
      />
      <Select
        v-for="(setting, s) in chosen.settings"
        :key="`${choice}-${s}`"
        v-model="settings[s]"
        :label="setting.label"
        :options="setting.options.map((label, value) => ({ label, value }))"
      />
      <p class="lobby__hint">{{ chosen.description }} Up to {{ chosen.maxPlayers }} players.</p>
      <Button class="lobby__create" :disabled="busy" @click="createRoom">CREATE ROOM</Button>
    </section>
    <section v-else-if="room && roomInfo" class="lobby__panel lobby__room">
      <p class="lobby__label">ROOM CODE</p>
      <p class="lobby__code">{{ room.code }}</p>
      <p class="lobby__game-name">{{ miniGame(roomInfo.game).title }}</p>
      <ul class="lobby__members">
        <li
          v-for="member in room.members"
          :key="member.id"
          :class="{ ready: member.ready || member.id === room.host }"
        >
          {{ member.name }}
          <small>{{
            member.id === room.host ? 'HOST' : member.ready ? 'READY' : 'NOT READY'
          }}</small>
        </li>
      </ul>
      <Button v-if="isHost" class="lobby__start" :disabled="!startable" autofocus @click="start"
        >START</Button
      >
      <Button v-else class="lobby__ready" autofocus @click="toggleReady">{{
        me?.ready ? 'NOT READY' : 'READY!'
      }}</Button>
    </section>
    <div class="lobby__prompts">
      <InputPrompt action="confirm" label="SELECT" :size="40" />
      <InputPrompt action="back" label="BACK" :size="40" />
    </div>
  </div>
</template>

<style scoped>
.lobby {
  position: absolute;
  inset: 0;
  color: #fff;
}
.lobby__title {
  position: absolute;
  left: 100px;
  top: 40px;
  margin: 0;
  font: 400 120px/1 var(--bl-font-display);
  color: #2f7cf6;
  transform: rotate(-4deg);
  -webkit-text-stroke: 6px #111;
  paint-order: stroke fill;
}
.lobby__panel {
  position: absolute;
  left: 140px;
  top: 220px;
  width: 1100px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  font-size: 36px;
}
.lobby__join {
  display: flex;
  gap: 20px;
  align-items: center;
}
.lobby__hint {
  margin: 0;
  font: 26px/1.4 var(--bl-font-body);
  color: #aaa;
}
.lobby__label {
  margin: 0;
  font: 30px var(--bl-font-display);
  color: #aaa;
}
.lobby__code {
  margin: 0;
  font: 400 160px/1 var(--bl-font-display);
  letter-spacing: 0.1em;
  color: #ffd60a;
}
.lobby__game-name {
  margin: 0;
  font: 50px var(--bl-font-display);
}
.lobby__members {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.lobby__members li {
  padding: 8px 20px;
  background: #222;
  font: 34px var(--bl-font-display);
  transform: skewX(var(--bl-skew));
}
.lobby__members li.ready {
  background: #2f7cf6;
}
.lobby__members small {
  margin-left: 12px;
  font-size: 0.6em;
}
.lobby__prompts {
  position: absolute;
  right: 100px;
  bottom: 50px;
  display: flex;
  gap: 40px;
  font: 28px var(--bl-font-display);
}
</style>
