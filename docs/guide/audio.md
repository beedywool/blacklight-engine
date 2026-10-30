# Audio

Sound and music play through Web Audio. Every sound goes to a bus (`music`, `sfx`, `voice`, `ui`), and the buses go to `master`. Sounds are decoded when their scene loads, so `play` starts without delay.

```ts
override create() {
  this.audio.music('battle', { fade: 800 });
}

override update() {
  if (this.input.pressed('jump')) this.audio.play('jump', { volume: 0.6, rate: 1.1 });
}
```

`scene.audio` looks sound keys up in the scene's folder first, then in `assets/`. `game.audio` is the audio manager itself, with the same `play`, `music` and `stopMusic` plus volumes and events.

<LiveExample src="concepts/audio" hint="Click anywhere: a blip plays from that point (left/right panning), higher when you click higher." />

## Buses and volumes

```ts
this.game.audio.volume('music', 0.5);
const sfx = this.game.audio.volume('sfx');
```

`volume(bus, value?)` reads or sets a bus volume (0 to 1, up to 2 to boost). Volumes are saved in `game.settings` under `audio.volumes` and restored at the next start, so an options menu only calls `volume`.

| Bus      | Default volume | Use                      |
| -------- | -------------- | ------------------------ |
| `master` | `1`            | Everything.              |
| `music`  | `0.8`          | `music()` tracks.        |
| `sfx`    | `1`            | Default bus of `play()`. |
| `voice`  | `1`            | Dialogue.                |
| `ui`     | `0.8`          | Menu sounds.             |

## Playing sounds

`play(key, options)` returns a `SoundHandle`.

| Option      | Default | Meaning                                                            |
| ----------- | ------- | ------------------------------------------------------------------ |
| `bus`       | `'sfx'` | `'music'`, `'sfx'`, `'voice'` or `'ui'`.                           |
| `volume`    | `1`     | 0 to 1, more to boost.                                             |
| `rate`      | `1`     | Playback rate; changes the pitch too.                              |
| `loop`      | `false` | Loop the sound.                                                    |
| `loopStart` | start   | Loop section start, in seconds.                                    |
| `loopEnd`   | end     | Loop section end, in seconds.                                      |
| `fade`      | none    | Fade-in duration in ms.                                            |
| `at`        | none    | Position in the scene: the sound pans and fades with the distance. |
| `range`     | `1200`  | Distance in virtual px at which a positioned sound is silent.      |

| Handle member              | Meaning                                             |
| -------------------------- | --------------------------------------------------- |
| `key`                      | The key played.                                     |
| `ended`                    | Promise resolved when the sound ends or is stopped. |
| `stop(fade?)`              | Stops, fading out over `fade` ms.                   |
| `setVolume(volume, fade?)` | Changes the volume, over `fade` ms.                 |
| `setPosition(at)`          | Moves a positioned sound.                           |

## Music

```ts
this.audio.music('battle', { fade: 800 });
this.audio.music('boss', { fade: 1500 }); // crossfade
this.audio.stopMusic({ fade: 1000 });
```

`music(key, options)` plays a track on the `music` bus, looping by default. The track playing fades out while the new one fades in over `fade` ms. Calling `music` with the track already playing does nothing and returns its handle, so a scene can call it in `create()` without restarting the song. `game.audio.currentMusic` is the key of the track playing. Music keeps playing across scene changes until another track or `stopMusic` replaces it.

A track with an intro loops on a section: the intro plays once, then the part between `loopStart` and `loopEnd` repeats.

```ts
this.audio.music('theme', { loopStart: 12.5, loopEnd: 98.25 });
```

## Positional sound

```ts
const hum = this.scene.audio.play('generator', {
  at: { x: this.x, y: this.y },
  range: 800,
  loop: true,
});
// if the source moves:
hum.setPosition({ x: this.x, y: this.y });
```

The listener is the center of the scene's main camera, updated every step. A positioned sound pans left or right with the horizontal distance (fully to one side at half the `range`) and its volume falls linearly to 0 at `range`. The position does not follow an object by itself: call `setPosition` when the source moves.

## Formats

Put several formats of one sound next to each other with the same name (`coin.ogg`, `coin.m4a`). Every format is decoded when the scene loads; a format the browser cannot decode is skipped with a console warning instead of failing the load. `play('coin')` then picks, among the decoded formats, the first one the browser reports it can play, in this order: `ogg`, `m4a`, `mp3`, `wav`, `opus`, `webm`, `aac`, `flac`. Ogg Vorbis is small and plays in Chrome, Firefox and Android; Safari on older iOS versions needs AAC (`.m4a`). Shipping `.ogg` plus `.m4a` covers every target.

## Unlocking

Browsers keep audio silent until the player interacts with the page. The engine resumes the audio context on the first pointer down, key press or touch end; `game.audio.unlocked` is `true` afterwards. Sounds played before that wait in the suspended context and start together when it unlocks: music started by the title scene begins at the first gesture. A title screen that waits for "press start" unlocks audio before anything else plays.

When the window is hidden or unfocused (with `pauseOnBlur`), all audio is suspended and resumes with the game. `game.pause()` instead fades the `music`, `sfx` and `voice` buses to silence (in about 150 ms) and keeps the `ui` bus playing, so a pause menu's sounds are heard; `game.resume()` fades them back to their volumes. The silenced sounds keep running while muted: music does not hold its position.

## Loading

A sound must be loaded before it plays; `play` with a sound that is not loaded throws, naming the file and how to load it. Files load with the scene:

- every file under `scenes/<name>/assets/` is loaded before the scene starts;
- files listed in the scene's `static assets` are loaded too, including folders (a path ending with `/`);
- a sound loaded by an earlier scene stays loaded.

```ts
export default class Battle extends Scene {
  static override assets = ['@assets/music/battle', '@assets/sfx/'];
}
```

A path without extension loads every format of that sound. Files directly in the top-level `assets/` folder are not loaded automatically; list them in `static assets`. See [Assets](./assets).

## Events and history

`game.audio.events` emits `play` (`{ key, bus }`) for every sound and `music` (`{ key }`, `undefined` when it stops) when the track changes. `game.audio.history` holds the keys of the last 50 sounds, newest last, for tests and the debug overlay.

## Limits

- Every format of a sound present in a loaded folder is downloaded, and every format the browser can decode is decoded, not only the one it plays. Ship two formats, not five.
- A sound with no format the browser can decode throws when played, naming the file.
- Positional sound is stereo panning and distance volume, not 3D audio: no Doppler, no occlusion.
- Sound effects played before the first user gesture are not dropped: they all start at the moment audio unlocks. Avoid playing effects on a screen the player has not touched yet.
- `game.pause()` mutes the `music`, `sfx` and `voice` buses without pausing their sounds: music keeps advancing silently, and music started for a pause menu with `music()` is muted too. An overlay opened with `game.overlay` does not mute anything.
