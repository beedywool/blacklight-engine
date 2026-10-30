# Deploy the servers

Blacklight Engine ships two servers that you host: the reference server (`servers/reference`), the HTTP API for cloud saves, achievements, leaderboards and account linking, and the relay (`servers/relay`, package `@blacklight/relay`), the WebSocket server for online play. They are independent: a game can use either, both, or neither. What each one does, its API and its configuration in detail are in [Reference server](/guide/server) and [Relay server](/guide/networking-relay); this page covers putting them on a machine, behind TLS, and keeping them running.

Neither server terminates TLS. Both speak plain HTTP (and plain WebSocket for the relay) and expect a reverse proxy in front for public use: a game served over HTTPS can only call `https://` and `wss://` addresses.

## At a glance

|              | Reference server                                   | Relay                                                         |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| Port         | `8080` (`PORT`)                                    | `5360` (`BLACKLIGHT_RELAY_PORT`)                              |
| Protocol     | HTTP, JSON                                         | WebSocket on any path (games use `/`), HTTP for health        |
| Health check | `GET /health` → `{"ok":true}`                      | `GET /health` → `{"ok":true,"peers":0,"rooms":0,"started":0}` |
| State        | SQLite file `reference.db` in `DATA_DIR` (`/data`) | in memory only                                                |
| Runtime      | Node.js 24 (runs the `.ts` sources directly)       | Node.js 22 or later (bundled `dist/relay.cjs`)                |
| Image        | `node:24-alpine`, user `node`, volume `/data`      | `node:24-alpine`, user `node`                                 |
| Build step   | none                                               | `pnpm --filter @blacklight/relay build`                       |

## Docker Compose

`servers/docker-compose.yml` runs both. The relay image copies `servers/relay/dist/relay.cjs`, so build the bundle before the image; the reference image copies the sources and needs no build.

```sh
pnpm install
pnpm --filter @blacklight/relay build
cd servers
cp reference/games.example.json reference/games.json   # then list your games
echo "SESSION_SECRET=$(openssl rand -base64 48)" > .env
```

Edit `OIDC_PROVIDERS` in `docker-compose.yml` to your identity provider and the client ids of your games (the file ships `https://sso.example.com` and `mygame`), then start:

```sh
docker compose build
docker compose up -d
docker compose ps
curl http://localhost:8080/health
curl http://localhost:5360/health
docker compose logs -f
```

Compose reads `SESSION_SECRET` from `.env` and refuses to start without it. The reference service mounts `./reference/games.json` read-only at `/config/games.json` and keeps its database in the named volume `reference_data` (Compose prefixes it with the project name: `servers_reference_data` when run from `servers/`). Create `games.json` before the first `up`: when the file is missing, Docker creates a directory in its place and the server stops with `cannot read GAMES_FILE`.

`servers/reference/docker-compose.yml` is the same reference service alone, run from `servers/reference` with `games.json` and `.env` in that folder (see [Run with Docker](/guide/server#run-with-docker)). The relay alone is `docker build -t blacklight-relay servers/relay` after the bundle build (see [Docker](/guide/networking-relay#docker)).

Both compose files publish the ports on every interface (`'8080:8080'`, `'5360:5360'`). With a reverse proxy on the same machine, change them to `'127.0.0.1:8080:8080'` and `'127.0.0.1:5360:5360'` so only the proxy reaches the servers, and set `TRUST_PROXY: 'true'`.

## Without Docker

The reference server needs Node.js 24 or later: it uses `node:sqlite` and runs the TypeScript sources with Node's type stripping, and it has no npm dependencies. From a checkout:

```sh
cd servers/reference
mkdir -p data
SESSION_SECRET="$(openssl rand -base64 48)" DATA_DIR=./data GAMES_FILE=./games.json \
  OIDC_PROVIDERS='[{"issuer":"https://sso.example.com","audiences":["mygame"]}]' \
  node src/index.ts
```

`pnpm start` in `servers/reference` runs the same `node src/index.ts`. `DATA_DIR` defaults to `/data`; point it at a folder the process can write.

The relay build writes two entry points. `dist/relay.cjs` is self-contained (the server and `ws` in one file), so it can be copied alone to a machine with Node.js 22 or later; `dist/cli.js` is the ESM command of the npm package and needs `ws` installed next to it.

```sh
pnpm --filter @blacklight/relay build
node servers/relay/dist/relay.cjs
# or, on another machine
scp servers/relay/dist/relay.cjs server:/opt/blacklight-relay/
ssh server 'BLACKLIGHT_RELAY_PORT=5360 node /opt/blacklight-relay/relay.cjs'
```

A systemd unit keeps either one running. For the relay:

```ini
# /etc/systemd/system/blacklight-relay.service
[Unit]
Description=Blacklight relay
After=network-online.target

[Service]
User=blacklight
Environment=BLACKLIGHT_RELAY_HOST=127.0.0.1
Environment=BLACKLIGHT_RELAY_PORT=5360
ExecStart=/usr/bin/node /opt/blacklight-relay/relay.cjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

For the reference server, the same with `WorkingDirectory=/opt/blacklight-reference`, `ExecStart=/usr/bin/node src/index.ts`, `EnvironmentFile=/etc/blacklight-reference.env` holding `SESSION_SECRET` and the other variables, and `DATA_DIR` pointing at a folder owned by the service user. Then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now blacklight-relay
journalctl -u blacklight-relay -f
```

## Environment variables

### Reference server

Read by `servers/reference/src/index.ts`. Invalid JSON in `OIDC_PROVIDERS` or in the games file, a missing `SESSION_SECRET` or one shorter than 32 characters stop the server at start with a message on stderr.

| Variable         | Default                              | Meaning                                                                                              |
| ---------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET` | required                             | Signs session tokens; at least 32 characters. Changing it signs every player out.                    |
| `OIDC_PROVIDERS` | `[]`                                 | JSON array of `{ "issuer", "audiences": [client ids], "internalUrl"? }`.                             |
| `GAMES_FILE`     | none (compose: `/config/games.json`) | JSON file of the games the server accepts; without it every game route answers `unknown_game`.       |
| `PORT`           | `8080`                               | Listening port, on every interface.                                                                  |
| `DATA_DIR`       | `/data`                              | Folder of `reference.db`.                                                                            |
| `CORS_ORIGINS`   | `*`                                  | Comma-separated origins allowed to call the API, or `*`.                                             |
| `MAX_BODY_BYTES` | `2097152`                            | Largest request body in bytes.                                                                       |
| `TRUST_PROXY`    | `false`                              | Exactly `true` to take the client address for the rate limit from the first `X-Forwarded-For` entry. |

The image also sets `NODE_ENV=production`, which the server does not read. Details and the games file format: [Reference server](/guide/server#environment-variables).

### Relay

Read by `servers/relay/src/cli.ts` (the `blacklight-relay` command and `relay.cjs`). A value that is not a whole number stops the relay at start.

| Variable                     | Default   | Meaning                 |
| ---------------------------- | --------- | ----------------------- |
| `BLACKLIGHT_RELAY_PORT`      | `5360`    | TCP port.               |
| `BLACKLIGHT_RELAY_HOST`      | `0.0.0.0` | Interface to listen on. |
| `BLACKLIGHT_RELAY_MAX_ROOMS` | `1000`    | Rooms open at once.     |
| `BLACKLIGHT_RELAY_MAX_PEERS` | `5000`    | Connections at once.    |

The keepalive interval (20 s) and the spectator limit (32 per room) are options of `startRelay()` only, with no variable. `servers/docker-compose.yml` sets no variable for the relay; add an `environment:` block to the `relay` service to change them.

## TLS and reverse proxy

Give each server its own host name (`api.example.com`, `relay.example.com`) or its own path. Games then use `https://api.example.com` as the `server` option of the online modules and `wss://relay.example.com` as the relay URL.

The proxy must:

- forward the WebSocket upgrade to the relay (`Upgrade` and `Connection` headers, HTTP/1.1 to the upstream);
- keep idle WebSocket connections open longer than the relay's keepalive: the relay pings every 20 s and closes a connection after two missed pings, so a proxy read timeout of 60 s or more is enough;
- for the reference server, set `X-Forwarded-For` to the client address and nothing else when `TRUST_PROXY=true`. The server takes the first entry of the header, so a proxy that appends to a header sent by the client (nginx's `$proxy_add_x_forwarded_for`) lets a client choose its own rate-limit bucket.

Request bodies up to `MAX_BODY_BYTES` (2 MiB by default) must pass the proxy; nginx's default `client_max_body_size` is 1 MiB.

### Caddy

Caddy obtains and renews certificates itself, proxies WebSocket upgrades without extra configuration, and replaces `X-Forwarded-For` with the client address unless the request comes from a proxy listed in `trusted_proxies`.

```
api.example.com {
  reverse_proxy 127.0.0.1:8080
}

relay.example.com {
  reverse_proxy 127.0.0.1:5360
}
```

### nginx

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name api.example.com;
  ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

  client_max_body_size 2m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl;
  http2 on;
  server_name relay.example.com;
  ssl_certificate     /etc/letsencrypt/live/relay.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:5360;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }
}
```

Certificates come from certbot or another ACME client. The relay does not read forwarded headers: it has no per-address logic.

Check the result from outside:

```sh
curl https://api.example.com/health
curl https://relay.example.com/health
curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://relay.example.com/   # 101 Switching Protocols
```

A plain HTTP request to the relay on any path other than `/health` answers 426 with a one-line explanation; that is expected.

## Backups

The relay keeps nothing on disk: rooms live in memory and end with the process.

The reference server keeps everything in `reference.db` in `DATA_DIR`, with `reference.db-wal` and `reference.db-shm` beside it while it runs (write-ahead log). Copying the files of a running server can produce an inconsistent copy; use SQLite's online backup, as in [Backups](/guide/server#backups):

```sh
cd servers
docker compose exec reference node -e "const { DatabaseSync } = require('node:sqlite'); new DatabaseSync('/data/reference.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp reference:/data/backup.db ./reference-$(date +%F).db
docker compose exec reference rm /data/backup.db
```

Without Docker, run the same `node -e` command with the path of your `DATA_DIR`. Schedule it (cron, a systemd timer) and copy the file off the machine. Keep `SESSION_SECRET`, the `OIDC_PROVIDERS` value and `games.json` with the backups: the database holds the data, these hold the configuration, and a new secret signs every player out.

To restore, stop the server, replace `reference.db` in the volume or folder, delete `reference.db-wal` and `reference.db-shm`, and start it again.

## Updating

```sh
git pull
pnpm install
pnpm --filter @blacklight/relay build
cd servers
docker compose build
docker compose up -d
```

`up -d` recreates the containers whose image changed. Restarting the relay closes every room: players in a match are disconnected, so update it when few rooms are open (`curl http://localhost:5360/health` shows `rooms` and `started`). A restart of the reference server costs a few seconds of failed requests; sessions survive it, since tokens are signed with `SESSION_SECRET` and not stored in memory.

The reference server creates its tables with `CREATE TABLE IF NOT EXISTS` at start and has no migration step; read the release notes before updating across versions that change the schema, and back up first. Pin a release tag rather than following `main` for production.

## Limits

- No built-in TLS in either server: a reverse proxy is required for `https://` and `wss://`.
- One instance each. The reference server stores data in a local SQLite file and keeps the rate limit (300 requests per minute per address) in memory; the relay keeps rooms in memory. Neither scales horizontally or shares state between instances. Run one relay per region instead of a cluster.
- The relay has no authentication and no rate limit beyond its room, connection and 64 KiB frame limits; add rate limits at the proxy for a public relay.
- The reference server has no signal handler. In a container Node runs as PID 1 and ignores `SIGTERM` without one, so `docker compose stop` waits for its 10 s timeout and then kills the process. Committed writes are safe in the write-ahead log; requests in flight fail.
- The reference server listens on every interface; there is no variable for the address. Restrict it with the published port (`127.0.0.1:8080:8080`) or a firewall.
- No database migrations, no admin interface, no metrics endpoint beyond `/health`. Logs go to stdout and stderr only.
