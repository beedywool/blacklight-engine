# Relay server

`@blacklight/relay` is the server online games connect to: it holds rooms, gives them codes, lists public rooms of a game and forwards messages between the members of a room. It does not run game code and does not look inside game messages, so one relay serves every game.

It runs three ways: as a Docker container on a server, as a Node command, or inside the desktop app for LAN play.

## Docker

```sh
pnpm --filter @blacklight/relay build
docker build -t blacklight-relay servers/relay
docker run -d --restart unless-stopped -p 5360:5360 --name relay blacklight-relay
curl http://localhost:5360/health   # {"ok":true,"peers":0,"rooms":0,"started":0}
```

The build bundles the server and its one dependency (`ws`) into `dist/relay.cjs`; the image is `node:24-alpine` plus that file, runs as the `node` user and has a health check on `/health`.

Put it behind a reverse proxy that terminates TLS, so games served over HTTPS connect with `wss://`. The proxy must forward WebSocket upgrades on `/`:

```nginx
location / {
  proxy_pass http://127.0.0.1:5360;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 120s;
}
```

## Node

```sh
pnpm add @blacklight/relay
pnpm exec blacklight-relay
```

| Variable                     | Default   | Meaning                 |
| ---------------------------- | --------- | ----------------------- |
| `BLACKLIGHT_RELAY_PORT`      | `5360`    | TCP port.               |
| `BLACKLIGHT_RELAY_HOST`      | `0.0.0.0` | Interface to listen on. |
| `BLACKLIGHT_RELAY_MAX_ROOMS` | `1000`    | Rooms open at once.     |
| `BLACKLIGHT_RELAY_MAX_PEERS` | `5000`    | Connections at once.    |

From code:

```ts
import { startRelay } from '@blacklight/relay';

const relay = await startRelay({ port: 5360 });
console.log(relay.urls); // ['ws://192.168.1.20:5360', …] LAN addresses first
await relay.close();
```

| `startRelay` option | Default     | Meaning                                                        |
| ------------------- | ----------- | -------------------------------------------------------------- |
| `port`              | `5360`      | `0` picks a free port (tests).                                 |
| `host`              | `'0.0.0.0'` | Interface.                                                     |
| `keepalive`         | `20000`     | Ms between pings; a connection silent for two pings is closed. |
| `maxRooms`          | `1000`      | Rooms open at once.                                            |
| `maxPeers`          | `5000`      | Connections at once.                                           |
| `spectatorLimit`    | `32`        | Most spectator places a room may ask for.                      |
| `log`               | none        | Receives one line per room created, started and closed.        |

## LAN hosting from the desktop app

`hostLan(game)` in `@blacklight/net` calls the native module `relay`, which `@blacklight/native` registers in Electron's main process from `relayNativeModule()` of this package:

| Method         | Argument            | Result                                                                                       |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `relay.start`  | `{ port?: number }` | `{ port, urls, local }`; starts once, later calls return the running relay. Port 1024–65535. |
| `relay.stop`   | none                | Stops it and disconnects its members.                                                        |
| `relay.status` | none                | `{ running, port?, rooms, peers }`.                                                          |

Arguments come from the renderer and are validated before use. The OS firewall may ask the player to allow incoming connections the first time.

## Protocol

Control messages are JSON text frames; game data are binary frames. A client sends `hello` (name, game id, protocol version) first, then `create`, `join`, `list`, `ready`, `start`, `leave`, `ping`; requests carry an `id` and answers echo it as `re`. The server answers `welcome`, `room` (the whole room after any change), `rooms`, `start` (seed, numbered players, spectators, `late` for spectators joining a started match), `left` (a member left a started match), `left-room`, `error` (with a `code`), `pong`.

A binary frame from a client starts with the target member id (`0` for every other member); the server replaces it with the sender's id and forwards the frame. Frames are limited to 64 KiB. The types are in `@blacklight/net/protocol`.

## Limits

- One process, rooms in memory: a restart closes every room. Run one relay per region rather than a cluster.
- No accounts, no rate limiting beyond the size limits: anyone who knows the address can create rooms. Put it behind a proxy with rate limits for a public deployment.
- The relay forwards inputs without checking them (it is not authoritative).
- WebSocket runs over TCP: on a lossy connection a lost packet delays the following ones, which shows as rollbacks or short waits.
