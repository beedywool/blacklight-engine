// NET-01: relay server with rooms, codes, lobby and WebSocket transport, driven by the real
// client (RelayClient from @blacklight/net, over Node's WebSocket).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelayClient, RelayError, type OnlineMatch } from '@blacklight/net';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@blacklight/net/protocol';
import { relayNativeModule, startRelay, type RelayServer } from '../src/index';
import { counterInstance } from '../../../packages/net/test/helpers';

let relay: RelayServer;
const clients: RelayClient[] = [];

async function client(name: string, game = 'test-game'): Promise<RelayClient> {
  const c = await RelayClient.connect(relay.local, { name, game });
  clients.push(c);
  return c;
}

function next<T>(subscribe: (resolve: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve) => subscribe(resolve));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  relay = await startRelay({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  for (const c of clients) c.close();
  await relay.close();
});

describe('relay server', () => {
  it('answers the health check and lists LAN addresses', async () => {
    const response = await fetch(`http://127.0.0.1:${relay.port}/health`);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(relay.local).toBe(`ws://127.0.0.1:${relay.port}`);
    expect(Array.isArray(relay.urls)).toBe(true);
  });

  it('refuses another protocol version and invalid names', async () => {
    await expect(RelayClient.connect(relay.local, { name: '', game: 'g' })).rejects.toThrow(
      /1 to 32/,
    );
    await expect(
      RelayClient.connect(relay.local, { name: 'x'.repeat(40), game: 'g' }),
    ).rejects.toBeInstanceOf(RelayError);
  });

  it('creates rooms with codes, lists public ones, joins and starts a match', async () => {
    const host = await client('Ana');
    const guest = await client('Bo');
    const other = await client('Cy', 'another-game');
    const room = await host.createRoom({ maxPlayers: 2, public: true, data: { mode: 'sumo' } });
    expect(room.code).toHaveLength(ROOM_CODE_LENGTH);
    expect([...room.code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
    expect(room.host).toBe(host.member);

    const lobby = await guest.listRooms();
    expect(lobby.find((r) => r.code === room.code)).toMatchObject({
      host: 'Ana',
      players: 1,
      data: { mode: 'sumo' },
    });
    expect((await other.listRooms()).find((r) => r.code === room.code)).toBeUndefined();
    await expect(other.joinRoom(room.code)).rejects.toMatchObject({ code: 'room-not-found' });

    const updated = next<unknown>((resolve) => host.events.on('room', resolve));
    const joined = await guest.joinRoom(room.code.toLowerCase());
    expect(joined.members.map((m) => m.name)).toEqual(['Ana', 'Bo']);
    await updated;

    await expect(host.start()).rejects.toMatchObject({ code: 'not-ready', message: /Bo/ });
    await expect(guest.start()).rejects.toMatchObject({ code: 'not-host' });
    const ready = next<unknown>((resolve) =>
      host.events.on(
        'room',
        (r) => r.members.every((m) => m.ready || m.id === r.host) && resolve(r),
      ),
    );
    guest.setReady(true);
    await ready;

    const third = await client('Di');
    await expect(third.joinRoom(room.code)).rejects.toMatchObject({ code: 'room-full' });

    const guestMatch = guest.match();
    const hostMatch = await host.start('fixed-seed');
    const theirs = await guestMatch;
    expect(hostMatch.seed).toBe('fixed-seed');
    expect(theirs.players).toEqual([
      { number: 1, member: host.member, name: 'Ana' },
      { number: 2, member: guest.member, name: 'Bo' },
    ]);
    expect(hostMatch.local).toEqual([1]);
    expect(theirs.local).toEqual([2]);
    expect((await guest.listRooms()).find((r) => r.code === room.code)).toBeUndefined();

    // Binary frames: to everyone else, or to one member; the relay stamps the sender.
    const received = next<[Uint8Array, number]>((resolve) =>
      theirs.transport.onMessage((data, from) => resolve([data, from])),
    );
    hostMatch.transport.send(new Uint8Array([7, 8, 9]));
    const [data, from] = await received;
    expect([...data]).toEqual([7, 8, 9]);
    expect(from).toBe(host.member);
    const direct = next<Uint8Array>((resolve) => hostMatch.transport.onMessage((d) => resolve(d)));
    theirs.transport.send(new Uint8Array([1]), host.member);
    expect([...(await direct)]).toEqual([1]);

    // Joining a started room: only as a spectator, which gets the match as a late member.
    await expect(third.joinRoom(room.code)).rejects.toMatchObject({ code: 'started' });
    const lateMatch = third.match();
    await third.joinRoom(room.code, { spectator: true });
    expect(await lateMatch).toMatchObject({ late: true, local: [], seed: 'fixed-seed' });

    // A member leaving a started room is announced to the session transport.
    const left = next<number>((resolve) => hostMatch.transport.onLeave(resolve));
    guest.close();
    expect(await left).toBe(theirs.self);
  });

  it('gives the room to another member when the host leaves before the start', async () => {
    const host = await client('Host');
    const guest = await client('Guest');
    const room = await host.createRoom();
    await guest.joinRoom(room.code);
    const changed = next<number>((resolve) =>
      guest.events.on('room', (r) => r.members.length === 1 && resolve(r.host)),
    );
    host.leave();
    expect(await changed).toBe(guest.member);
    guest.leave();
    await wait(50);
    expect(relay.hub.rooms.has(room.code)).toBe(false);
  });

  it('counts couch players: two local players take two slots', async () => {
    const host = await client('Couch');
    const room = await host.createRoom({ maxPlayers: 3, players: 2 });
    const guest = await client('Solo');
    await guest.joinRoom(room.code);
    guest.setReady(true);
    await wait(50);
    const match: OnlineMatch = await host.start();
    expect(match.local).toEqual([1, 2]);
    expect(match.players.map((p) => p.name)).toEqual(['Couch 1', 'Couch 2', 'Solo']);
  });

  it('carries a rollback session between two machines', async () => {
    const host = await client('A');
    const guest = await client('B');
    const room = await host.createRoom({ maxPlayers: 2 });
    await guest.joinRoom(room.code);
    guest.setReady(true);
    await wait(50);
    const guestMatch = guest.match();
    const instances = [counterInstance(await host.start()), counterInstance(await guestMatch)];
    for (let f = 0; f < 240; f++) {
      for (const i of instances) i.tick();
      await wait(2);
    }
    const [a, b] = instances.map((i) => i.session.checksums);
    let compared = 0;
    for (const [frame, hash] of a!)
      if (b!.has(frame)) {
        expect(b!.get(frame)).toBe(hash);
        compared++;
      }
    expect(compared).toBeGreaterThan(3);
  });

  it('runs as the relay native module of the desktop app', async () => {
    const native = relayNativeModule();
    await expect(native.start({ port: 80 })).rejects.toThrow(/1024 to 65535/);
    await expect(native.start('5360')).rejects.toThrow(/port\?: number/);
    const info = await native.start({ port: 5368 });
    expect(info.port).toBe(5368);
    expect(info.local).toBe('ws://127.0.0.1:5368');
    expect(await native.start()).toEqual(info);
    const c = await RelayClient.connect(info.local, { name: 'Lan', game: 'g' });
    await c.createRoom();
    expect(await native.status()).toMatchObject({ running: true, rooms: 1, peers: 1 });
    c.close();
    await native.stop();
    expect(await native.status()).toEqual({ running: false, rooms: 0, peers: 0 });
  });
});
