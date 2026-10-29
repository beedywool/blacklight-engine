# Telemetry and crash reports

The `telemetry` module (`@blacklight/module-telemetry`) sends crash reports and usage events to a backend that speaks the Sentry protocol: sentry.io, Sentry self-hosted or GlitchTip. It is opt-in: nothing is recorded, kept or sent until the player agrees, and the answer is remembered on the device. Events describe the build and the error, never the player.

```sh
blacklight add telemetry
```

```ts
// game.config.ts
modules: {
  telemetry: { dsn: 'https://3f2a…@glitchtip.example.com/3' },
}
```

```ts
// scenes/title/title.scene.ts
const telemetry = this.game.modules.telemetry;
await telemetry.askConsent(); // asks once; later runs return the saved answer
telemetry.track('title-shown');
```

Without `dsn` the module records nothing (dev builds say so once in the console), so the same code runs in builds that ship without a backend.

## What is sent

Each event is one HTTP `POST` of a Sentry envelope to `<host>/<path>/api/<project id>/envelope/`. The public key goes in the query string (`sentry_key`, `sentry_version=7`), as the Sentry browser SDK does, so browsers send the request without a CORS preflight. An event holds:

| Field                    | Content                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `event_id`, `timestamp`  | Random id, time of the event.                                                                       |
| `level`, `logger`        | `error` for exceptions, the given level for messages; `telemetry` or `telemetry.event` for `track`. |
| `release`, `environment` | `<game id>@<version>` and `production` / `development` unless configured.                           |
| `exception`              | Error type, message and stack trace, with file locations scrubbed (below).                          |
| `message`, `extra`       | The message or event name, and the values passed with it.                                           |
| `tags`                   | `platform` (`web`, `desktop`, `android`, `ios`), `steam: 'true'` in Steam builds.                   |
| `contexts`               | Game id and version; runtime (`browser`, `electron`, `webview`).                                    |
| `breadcrumbs`            | The last scene changes and `breadcrumb()` calls, kept in memory only.                               |
| `sdk`                    | `blacklight.telemetry` and its version, with `infer_ip: 'never'`.                                   |

What is never sent: a `user` object, the IP address (`infer_ip: 'never'` tells the backend not to derive it from the request), the device or computer name, the page URL, query strings, cookies, or account data from `accounts-oidc`. Stack frame locations are rewritten to `app:///<path inside the game>`: the folder the game is installed in (`file:///home/<user>/…/app.asar/`, `C:\Users\<user>\…`) and everything before `/assets/` is cut, query strings and fragments are dropped, and a file outside the game keeps only its name. Values you pass in `extra`, `track()` data and messages are sent as written: keep names, e-mail addresses and free text typed by the player out of them.

## Options

| Option            | Default                      | Meaning                                                                                    |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `dsn`             | none                         | DSN from the project settings of Sentry or GlitchTip. Without it nothing is recorded.      |
| `environment`     | `production` / `development` | `development` in `blacklight dev`, `production` in builds.                                 |
| `release`         | `<id>@<version>`             | Release name; match it when you upload source maps to the backend.                         |
| `sampleRate`      | `1`                          | Share of events sent, 0 to 1, for crashes and usage events alike.                          |
| `crashes`         | `true`                       | Reports uncaught errors (`error`) and unhandled promise rejections (`unhandledrejection`). |
| `events`          | `true`                       | Sends the usage events of `track()`.                                                       |
| `maxBreadcrumbs`  | `20`                         | Breadcrumbs kept and attached to each event (0 to 100).                                    |
| `consent.title`   | `Help improve the game?`     | Title of the consent question.                                                             |
| `consent.message` | English sentence             | Body of the question: what is sent and that it can be changed later.                       |
| `consent.allow`   | `Send reports`               | Label of the button that grants consent.                                                   |
| `consent.deny`    | `No thanks`                  | Label of the button that refuses.                                                          |

An invalid DSN stops the game at startup with the expected shape, `https://<public key>@<host>/<project id>`.

## Consent

`consent` is `'unknown'` until the player answers, then `'granted'` or `'denied'`, stored in the module's storage on the device. `askConsent()` asks only while it is `'unknown'` and returns `true` when granted; pass `{ force: true }` from a settings screen to ask again. It shows the question in the first way available:

1. Your screen: `askConsent({ ask: (texts) => this.ui.modal(ConsentScreen, texts) })`, which resolves with the player's choice.
2. The UI layer (`@blacklight/ui`): its `confirm` dialog in the current scene, with the `consent` texts.
3. A built-in dialog over the game (black surface, two buttons, focus on "allow", Enter accepts, Escape refuses), also exported as `consentDialog(mount, texts)`.

`setConsent(granted)` records an answer directly, for a toggle in the settings. Refusing deletes the events still waiting to be sent and the breadcrumbs. Before consent, `captureException`, `captureMessage`, `track` and `breadcrumb` do nothing and return `undefined`; uncaught errors are ignored.

## API

`game.modules.telemetry`:

| Member                            | Returns                              | Meaning                                                                      |
| --------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `consent`                         | `'unknown' \| 'granted' \| 'denied'` | The player's answer.                                                         |
| `askConsent({ ask?, force? })`    | `Promise<boolean>`                   | Asks once (see above) and stores the answer.                                 |
| `setConsent(granted)`             | `Promise<void>`                      | Stores an answer; refusing clears waiting events.                            |
| `captureException(error, extra?)` | `Promise<string \| undefined>`       | Reports an error with its scrubbed stack; resolves with the event id.        |
| `captureMessage(message, level?)` | `Promise<string \| undefined>`       | Reports a message (`info` by default; `fatal`, `error`, `warning`, `debug`). |
| `track(name, data?)`              | `Promise<string \| undefined>`       | Usage event (`level-complete`, `settings-opened`) when `events` is on.       |
| `breadcrumb(message, data?)`      | `void`                               | Adds a step to the trail attached to the next events.                        |
| `pending`                         | `number`                             | Events stored on the device and not delivered yet.                           |
| `flush()`                         | `Promise<void>`                      | Tries to deliver the stored events now.                                      |

`undefined` means nothing was sent: no consent, no DSN, or the event was sampled out. The module also exports `parseDsn`, `parseStack`, `scrubFilename` and `consentDialog`.

## Self-hosted backends

Any backend that accepts Sentry envelopes works; the module needs only the DSN.

- **GlitchTip**: create an organization and a project (platform JavaScript), copy the DSN from the project settings. GlitchTip is open source (MIT) and runs with Docker next to the [reference server](./server).
- **Sentry self-hosted** or **sentry.io**: create a JavaScript project and copy its DSN (Settings › Client Keys). Turn on "Prevent Storing of IP Addresses" in the project's security settings as well; the module never sends one, the setting covers requests from other tools.

For the web build, the backend must accept requests from the game's origin: sentry.io and GlitchTip allow any origin by default (Settings › Allowed Domains narrows it). Desktop and mobile builds send from the app's own origin.

## Offline

Events are written to the device first, then sent in order. A network failure, a `429` or a `5xx` answer keeps them and retries with growing delays (1 second, doubling, up to 5 minutes), when the connection returns and when the app resumes; they survive restarts. A `4xx` answer other than `408` and `429` drops the event, since sending it again would fail the same way. At most 1000 events wait; the oldest go first.

## Privacy notice

Telemetry is personal-data-light, not anonymous: the backend sees the request's IP address when it arrives, even if it does not store it. Before shipping, write in your privacy notice:

- that crash reports and usage events are sent only after the player agrees, and how to withdraw (the setting that calls `setConsent(false)`);
- what an event contains (the table above) and which `track()` events you send;
- who runs the backend and where (sentry.io region, or your own server), and how long events are kept there;
- that the IP address is not stored (check your backend's setting).

## Limits

- Errors and messages only: no performance tracing, no session replay, no profiling.
- The engine does not upload source maps. Release builds are minified (and obfuscated when enabled), so stack traces need the private source maps of each release: upload them to your backend yourself, under the same `release` name.
- `sampleRate` draws with `Math.random`, so the same run can keep one event and drop the next.
- Errors thrown before the module starts (while the game loads) and errors in the Electron main process are not reported.
- The built-in consent dialog is English unless you set the `consent` texts; use your own screen (`ask`) for translated games.
