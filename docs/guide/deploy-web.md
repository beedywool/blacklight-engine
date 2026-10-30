# Deploy a web game

`blacklight build --target web` (the `build` script of every template) writes the game to `dist/` as a Progressive Web App: a folder of static files that any HTTPS host serves, that players can install like an app, and that runs without a network once it has loaded one time. Desktop and mobile builds do not get the web app parts; their files are already on the device.

## What the build writes

| File                          | What                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                  | The page: links the manifest and icon, sets the title and `theme-color`, loads the entry chunk                                                                      |
| `assets/`                     | Hashed chunks (one per scene) and every asset of the game as its own file (`assetsInlineLimit: 0`: nothing is inlined), so each one can be cached                   |
| `manifest.webmanifest`        | Web app manifest from `game.config.ts`: `name`, `short_name` (the first 12 characters), `id` (from the reverse-domain `id`), orientation, full screen, black splash |
| `icons/icon-192.png`, `-512…` | Icons scaled from `icon.png` at the game's root (square, 512×512 or larger, the same file desktop builds use), or a placeholder bulb when the game has none         |
| `sw.js`                       | Service worker that precaches every file above                                                                                                                      |

The entry registers `sw.js` when the page is served over `http(s)`. On the first visit the worker downloads every file of the build into a cache named `blacklight:<id>:<version>`, where the version is a hash of the build's files: two builds with any difference get two caches. From then on, every request for a file of the game is answered from that cache, with byte ranges for audio and video, so the game starts and plays offline, including scenes the player has not opened yet.

Requests the cache cannot answer go to the network unchanged: API calls of the HTTP module, the reference server, the relay, or any URL on another origin. Offline, they fail the way they fail without a service worker (a rejected `fetch`, a closed WebSocket), and the modules' offline queues keep the writes until the network returns (see [Modules](/guide/modules)).

## Host it

Upload the content of `dist/` to a web root served over HTTPS. Browsers only register service workers and offer installation on HTTPS origins (and on `localhost` for testing):

```sh
pnpm build
pnpm preview            # http://localhost:4173, with the service worker, to check before uploading
```

Every path in the build is relative (`./assets/…`), so the folder works at the root of a domain or under a path (`https://example.com/games/my-game/`). The service worker's scope is the folder that holds `sw.js`; two games under the same origin need two folders.

Headers to set on the host:

| Path                                 | `Cache-Control`                       | Why                                                               |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------------------- |
| `sw.js`                              | `no-cache`                            | Browsers check it for updates; a cached copy delays a new version |
| `index.html`, `manifest.webmanifest` | `no-cache`                            | They name the hashed files of the current build                   |
| `assets/*`, `icons/*`                | `public, max-age=31536000, immutable` | Hashed or stable names                                            |

Serve `manifest.webmanifest` as `application/manifest+json` and `.js` files as `text/javascript`. Release builds carry their Content Security Policy in a `<meta>` tag of `index.html`; a policy sent by the host as a header must allow the same sources (`script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, see [Production hardening](/guide/security)).

An nginx server block:

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name play.example.com;
  ssl_certificate     /etc/letsencrypt/live/play.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/play.example.com/privkey.pem;
  root /var/www/my-game;

  location = /sw.js { add_header Cache-Control "no-cache"; }
  location = /manifest.webmanifest {
    default_type application/manifest+json;
    add_header Cache-Control "no-cache";
  }
  location = /index.html { add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
}
```

The same with Caddy, which obtains the certificate itself:

```
play.example.com {
  root * /var/www/my-game
  file_server
  @fresh path /sw.js /index.html /manifest.webmanifest
  header @fresh Cache-Control "no-cache"
  header /assets/* Cache-Control "public, max-age=31536000, immutable"
}
```

GitHub Pages, Cloudflare Pages, Netlify and itch.io (HTML5 upload of the `dist/` folder as a zip) serve the build without configuration; on hosts that do not let you set headers, updates reach players a few minutes later.

## Updates

A new build has a new version, so its worker installs next to the running one and downloads the new files while the player keeps playing the old version. It takes over when every tab of the game is closed; the next start runs the new version and its activation deletes the caches of older builds of the same game. Saves live in the browser's storage, not in the cache, and are kept.

Games are not updated in the middle of a session: a scene chunk of the old build is still served from the old cache until the game is closed. This matches PF-08 (updates through stores only) on the web, where the host is the store.

## Install it

Chrome, Edge and Samsung Internet on Android and desktop offer "Install app" in the address bar or menu once the page has loaded with its manifest and worker. Safari on iOS and iPadOS installs from Share → Add to Home Screen; macOS Safari from File → Add to Dock. The installed game opens full screen without browser controls, with its name and icon. `MANUAL_TESTS.md` lists the steps checked on real phones.

## Limits

- The whole build is downloaded on the first visit, including videos and every scene. A large game takes that long on a slow connection before it can play offline; the game itself starts as soon as its first scene is loaded.
- Browsers may evict the cache of a site that has not been opened for weeks when the device runs out of space (an installed app is evicted last). The next online visit downloads it again; saves are not in that cache.
- Firefox on desktop does not install web apps; the game runs in a tab there, offline included.
- iOS keeps service worker caches per home-screen app and per Safari profile: a game installed on the home screen does not share its cache with the same game opened in Safari.
- No push notifications, background sync or periodic updates: the worker only serves the game's files.
