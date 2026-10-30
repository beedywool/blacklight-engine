# Video

Background loops and cutscenes play in the UI layer with `<VideoPlayer>`, `playCutscene()` and the `Cutscene` screen. Ship each video in two formats with the same name: WebM VP9 (with alpha if needed) for desktop and Android, and MP4 H.264 for every platform (Apple devices, and Chromium builds without proprietary codecs fall back the other way). For video inside a scene, under game objects, use core's [`Video` object](./objects).

```
assets/video/
├── intro.webm      # VP9 (+ alpha), Opus
├── intro.mp4       # H.264, AAC
└── intro-en.vtt    # subtitles
```

```ts
import { playCutscene } from '@blacklight/ui';

const how = await playCutscene(this.ui, 'intro', { subtitles: 'intro-en' });
// 'ended' or 'skipped'
await this.goto('chapter1', undefined, { transition: 'iris' });
```

```vue
<!-- a menu with a looping background video -->
<template>
  <div class="menu">
    <VideoPlayer src="menu-loop" background />
    <MenuList :items="items" />
  </div>
</template>
```

<LiveExample src="concepts/video" hint="A video as a game object (looping, muted), and Enter plays it as a cutscene with subtitles (hold Enter to skip). The browser picks intro.webm or intro.mp4, whichever it can play." />

## Sources

A source is an asset name (`intro`), a path (`@assets/video/intro`), a URL, or a list of them. An asset name or a path without extension gives every format of that file. The order follows the platform: WebM first, so desktop browsers and Android keep the alpha channel; MP4 first on Apple WebKit (Safari, iOS), which plays WebM without alpha. `videoSources(game, source)` returns the list.

Encode with ffmpeg:

```sh
# WebM VP9 with alpha (from a ProRes 4444 or PNG sequence with transparency)
ffmpeg -i intro.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 2M -c:a libopus intro.webm
# MP4 H.264 for every platform (no alpha)
ffmpeg -i intro.mov -c:v libx264 -pix_fmt yuv420p -profile:v high -crf 20 -c:a aac -movflags +faststart intro.mp4
```

## VideoPlayer

| Prop         | Default   | Meaning                                                                                                         |
| ------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| `src`        | required  | Source (see above).                                                                                             |
| `autoplay`   | `true`    | Starts at once. A video with sound that the browser refuses to autoplay emits `error`; backgrounds retry muted. |
| `loop`       | `false`   | Loops.                                                                                                          |
| `muted`      | `false`   | No sound.                                                                                                       |
| `background` | `false`   | Fills the parent behind its other content, muted and looping.                                                   |
| `fit`        | `'cover'` | `'cover'` crops to fill, `'contain'` letterboxes.                                                               |
| `subtitles`  | none      | Cues, a `.vtt` / `.srt` asset name or path, or a URL.                                                           |
| `bus`        | `'music'` | The video's volume follows master × this bus.                                                                   |

| Event           | When                                   |
| --------------- | -------------------------------------- |
| `ended`         | Playback reached the end, or `skip()`. |
| `error(error)`  | No source plays, or autoplay refused.  |
| `time(seconds)` | Every displayed frame.                 |

Exposed: `play()`, `pause()`, `skip()` and `element` (the `<video>`).

## Cutscenes

`playCutscene(ui, source, options)` pushes the `Cutscene` screen: the video fills the screen (letterboxed on black), game input is blocked, and the promise resolves with `'ended'` or `'skipped'`.

| Option      | Default   | Meaning                                                                                                     |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `subtitles` | none      | As for `VideoPlayer`.                                                                                       |
| `skip`      | `'hold'`  | `'hold'`: hold confirm 0.7 s (or press back) to skip; `'press'`: confirm skips; `false`: cannot be skipped. |
| `bus`       | `'music'` | Volume bus.                                                                                                 |

The first confirm (or click) shows the skip prompt with a progress bar while confirm is held. A video that fails to play ends the cutscene at once, so a missing codec never blocks the game.

## Subtitles

Subtitles are WebVTT (or SRT) files, parsed by the engine and drawn with the player's [subtitle settings](./ui-accessibility#subtitles); they are hidden when the player turned subtitles off. `<v Name>` voice spans show as `Name: `; cue settings (`align:start`) are ignored. `parseVtt(text)` and `cueAt(cues, seconds)` are exported. Keep one file per language and pick it with a locale key, as the visual-novel template does (`t('subtitles.file')` → `intro-ja`).

## Limits

- The video's sound plays through the `<video>` element, not Web Audio: it follows the bus volume when the video starts and is not affected by pause or the audio context; positional audio does not apply.
- Videos are not part of the scene snapshot; a cutscene restarts from the beginning after a load.
- iOS plays inline video only when muted until the first user gesture; start cutscenes from a button press.
- WebM alpha is lost on Apple platforms (they receive the MP4).
