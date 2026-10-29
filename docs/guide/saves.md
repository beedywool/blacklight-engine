# Saves

`game.save` holds the current game's data and writes it to slots. Files go through `game.platform.files`: the OS data folder on desktop, app storage on mobile, IndexedDB on the web. Release builds encrypt every file with a key that belongs to this install and sign it, so a save cannot be read or edited with a generic tool; dev builds write readable JSON so you can inspect what your game stores.

```ts
// scenes/title/title.scene.ts
import { SaveError, Scene } from '@blacklight/core';

export default class Title extends Scene {
  override async create() {
    try {
      await this.game.save.load(1);
    } catch (error) {
      if (error instanceof SaveError && error.hasBackup) {
        // The file was modified or damaged: offer the previous version.
        if (await this.ui.confirm({ message: 'This save is damaged. Load the previous one?' })) {
          await this.game.save.load(1, { backup: true });
        }
      } else {
        this.game.save.reset({ gold: 0, party: ['ann'] }); // new game
      }
    }
  }

  override update() {
    if (this.input.pressed('confirm')) void this.game.save.save(1, { label: 'Chapter 1' });
  }
}
```

Give the data its type once, anywhere in the game:

```ts
declare module '@blacklight/core' {
  interface SaveData {
    gold: number;
    party: string[];
  }
}
```

## Configuration

```ts
export default defineConfig({
  // ...
  save: {
    slots: 3,
    autosave: { interval: 300, onSceneChange: true },
    version: 2,
    migrations: { 2: (data) => ({ ...data, gems: 0 }) },
    location: { windows: '%USERPROFILE%/Saved Games/My Game' },
  },
});
```

| Field        | Default                     | Meaning                                                                                                                                                                   |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slots`      | `10`                        | Numbered slots, from 1. `'auto'` and named slots (`'quick'`) come on top.                                                                                                 |
| `autosave`   | `false`                     | `true` writes the `'auto'` slot on every scene change; `{ interval, onSceneChange }` also every `interval` seconds of play. Nothing is written before the data has a key. |
| `encryption` | `true` release, `false` dev | AES-256-GCM with the per-install key.                                                                                                                                     |
| `integrity`  | same as `encryption`        | HMAC-SHA-256 over the whole file. Plain files are refused.                                                                                                                |
| `version`    | `1`                         | Format version of `save.data`, written into each save.                                                                                                                    |
| `migrations` | `{}`                        | `migrations[n]` turns version `n − 1` data into version `n`. Loading an older save runs every step up to `version`.                                                       |
| `location`   | OS standard                 | Desktop save folder: a path, or one per OS (`windows`, `mac`, `linux`). `~`, `%VAR%` and `$VAR` are expanded.                                                             |

## Slots and metadata

| Member                    | Meaning                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                    | The current game's data, a plain JSON object.                                                                                                                                                                                 |
| `save(slot?, options?)`   | Writes `data` to `slot` (the last slot used, else 1). `options.label` is free text; `options.thumbnail` is `true` (a 320 px JPEG of the current frame), `false` or a data URL. Resolves with the metadata.                    |
| `load(slot, { backup? })` | Replaces `data`, migrating older formats. Throws `SaveError` (below).                                                                                                                                                         |
| `list()`                  | Every slot on the device, numbered slots first: `{ slot, status, meta, version, hasBackup }`. `status` is `ok`, `tampered`, `corrupted`, `version` (newer game, or a missing migration) or `missing` (only a backup is left). |
| `delete(slot)`            | Removes the slot, its backup and its cloud copy.                                                                                                                                                                              |
| `exists(slot)`            | `true` when the slot has a file.                                                                                                                                                                                              |
| `autosave()`              | Writes `'auto'` now (when `data` is not empty).                                                                                                                                                                               |
| `reset(data?)`            | Starts a new game: new data, no slot, play time 0.                                                                                                                                                                            |
| `slot`, `playTime`        | Last slot saved or loaded; play time in ms of game time (pauses excluded).                                                                                                                                                    |
| `events`                  | `saved`, `loaded`, `deleted`, `rejected` (a slot could not be read), `synced`.                                                                                                                                                |

Metadata (`meta`) holds `date` (ms since 1970), `playTime`, `scene`, `label`, `summary` and `thumbnail`, enough for a save/load screen without loading the save.

`SaveError.code` says what went wrong: `missing`, `tampered` (a byte changed, or the file is plain while the build requires protection, or another install wrote it), `corrupted` (not a save), `version`, `password` (export), `invalid-slot`. `error.hasBackup` is `true` when `load(slot, { backup: true })` can load the previous version.

## Save/load screens

The UI's ready-made `SaveLoadScreen` and `PauseScreen` take a `slots` object; `game.save.screenSlots()` gives them these saves:

```ts
import { SaveLoadScreen } from '@blacklight/ui';

const slots = this.game.save.screenSlots({
  collect: () => ({ dialogue: dialogue.state() }), // merged into save.data before each save
  apply: (data) => this.game.goto('story', { dialogue: data.dialogue }), // after each load
});
this.ui.push(SaveLoadScreen, { slots, mode: 'load' });
```

The list shows valid slots, and modified ones that still have a backup; loading such a slot loads the backup. `label`, `summary` and the thumbnail the screen passes are stored in the save's metadata (play time is shown in seconds). `fileSlots()` from `@blacklight/ui` stays for prototypes: plain JSON, no encryption.

## Files, encryption and backups

Each slot is `saves/<slot>.sav` with its previous version in `saves/<slot>.bak`, inside the game's data folder:

| Platform | Folder                                        |
| -------- | --------------------------------------------- |
| Windows  | `%APPDATA%\<id>`                              |
| macOS    | `~/Library/Application Support/<id>`          |
| Linux    | `$XDG_DATA_HOME/<id>` (`~/.local/share/<id>`) |
| Mobile   | app-private storage                           |
| Web      | IndexedDB database `blacklight:<id>`          |

`<id>` is `id` from `game.config.ts`. `game.platform.files.location` gives the folder, for a settings screen or support.

Writes are atomic: the desktop app writes a temporary file in the same folder, flushes it to disk and renames it over the old one, so a crash leaves the old or the new save, never half of one. Before writing, the current file becomes the backup, but only when it is still valid: a damaged or edited file never replaces a good backup.

A release save is a `BLSV` file: a header, the AES-256-GCM ciphertext of the JSON (the header is its additional data), then an HMAC-SHA-256 of everything before it. Changing any byte, including the header, makes the load fail with `tampered`. The key is 32 random bytes made on first use and kept by the OS keystore: Electron `safeStorage` on desktop (DPAPI, Keychain, libsecret or KWallet), the iOS Keychain and the Android Keystore on mobile, a non-extractable WebCrypto key in IndexedDB on the web. The HMAC key is derived from it, so nothing else needs storing. Saves therefore open only on the install that wrote them; use export and import to move them.

Dev builds write the same payload as indented JSON (`{ version, meta, data }`), and read encrypted saves too. Release builds refuse plain files: a player cannot drop an edited JSON save into the folder.

## Export and import

```ts
await game.save.downloadExport(password); // browser download, save dialog on desktop
const slots = await game.save.import(bytes, password); // bytes from a file input
```

`export(password, slots?)` returns the bytes of a `BLEX` file: the chosen slots (all by default), encrypted with AES-256-GCM under a key derived from the password (PBKDF2-SHA-256, 600 000 iterations). `import(bytes, password)` checks the password and that the file comes from this game (`id`), then writes each slot with this install's key, keeping the previous files as backups.

## Cloud saves

The cloud-save module (game server or Steam Cloud) plugs into the save manager. The manager owns the rules; a provider only moves decoded saves:

```ts
game.save.useCloud(provider, {
  conflict: async ({ slot, local, remote }) =>
    (await askPlayer(local, remote)) ? 'local' : 'remote',
});
const report = await game.save.sync(); // { uploaded, downloaded, conflicts, error? }
```

| Provider method         | Meaning                                      |
| ----------------------- | -------------------------------------------- |
| `list()`                | Remote slots with their `date`.              |
| `download(slot)`        | The remote save (`{ version, meta, data }`). |
| `upload(slot, payload)` | Stores a save.                               |
| `remove(slot)`          | Deletes the remote copy.                     |

Every save is uploaded in the background. `sync()` compares both sides with the date of the last sync of each slot (`saves/cloud-sync.json`): a slot changed on one side only is copied to the other; a slot changed on both sides is a conflict, resolved by `conflict` (`'newest'` by default, or a function that asks the player). Offline, `sync()` changes nothing and reports the error; the next sync retries. `steam(game).cloud` from `@blacklight/native` is a ready provider for Steam Cloud.

Modules use the narrower `ModuleSaves` view (`context.saves`): `slots()`, `exportSlot(slot)` (portable bytes: the save as UTF-8 JSON), `importSlot(slot, bytes)` and `onSaved(listener)`.

## Limits

- A save opens only on the install that wrote it (the key never leaves the OS keystore). Reinstalling the OS or clearing site data loses the key; exports and cloud saves are the way to keep saves across installs.
- On Linux without a secret service (no GNOME Keyring or KWallet, as on some minimal desktops), the desktop app stores the key unencrypted in its user-data folder, readable by that user only, and logs a warning.
- Cloud copies and `exportSlot` bytes are plain JSON: their protection is the transport and the server (or Steam). A player can edit a Steam Cloud file on disk before it syncs; anything that must be fair is checked by a server (accepted limitation L4).
- Protection against editing is a deterrent: a player with a debugger attached to their own game can change values before they are saved.
