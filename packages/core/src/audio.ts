import { AUDIO_EXTENSIONS, extension, type AssetStore } from './assets';
import { EventBus } from './events';
import { clamp, type Point } from './math';
import type { AssetKey } from './register';

/**
 * A volume bus. Every sound plays on one of `music`, `sfx`, `voice` or `ui`; `master` scales them
 * all. Players set bus volumes in the options menu (`game.audio.volume('music', 0.5)`).
 */
export type Bus = 'master' | 'music' | 'sfx' | 'voice' | 'ui';
const BUSES: Bus[] = ['master', 'music', 'sfx', 'voice', 'ui'];

/** How a sound plays: bus, volume, pitch, looping, fade-in and position in the scene. */
export interface PlayOptions {
  /** @defaultValue `'sfx'` */
  bus?: Exclude<Bus, 'master'>;
  /** 0–1 (or more to boost). @defaultValue `1` */
  volume?: number;
  /** Playback rate (pitch). @defaultValue `1` */
  rate?: number;
  /** Restart from `loopStart` at the end instead of stopping. @defaultValue `false` (`true` for music) */
  loop?: boolean;
  /** Loop section in seconds (music with an intro). */
  loopStart?: number;
  /** End of the loop section in seconds. @defaultValue the end of the file */
  loopEnd?: number;
  /** Fade-in duration in ms. */
  fade?: number;
  /** Position in the scene: the sound pans and fades with the distance to the listener. */
  at?: Point;
  /** Distance (virtual px) at which a positioned sound is silent. @defaultValue `1200` */
  range?: number;
}

/** A playing sound. */
export interface SoundHandle {
  /** Key or path the sound was played with. */
  readonly key: string;
  /** Resolves when the sound ends or is stopped. */
  readonly ended: Promise<void>;
  /** Stops, optionally fading out over `fade` ms. */
  stop(fade?: number): void;
  /** Changes the volume (0–1), optionally over `fade` ms. */
  setVolume(volume: number, fade?: number): void;
  /** Moves a positioned sound. */
  setPosition(at: Point): void;
}

export interface AudioEvents {
  play: { key: string; bus: Bus };
  music: { key: string | undefined };
}

const VOLUMES_SETTING = 'audio.volumes';

/** Settings store used to persist bus volumes. */
export interface AudioSettings {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

/**
 * Sound and music through Web Audio, with volume buses (music, sfx, voice, ui) under a master.
 * The audio context unlocks on the first click, tap or key press, as browsers require.
 *
 * @example
 * ```ts
 * this.audio.play('coin');
 * this.audio.music('battle', { fade: 800 });
 * this.audio.volume('music', 0.5);
 * ```
 */
export class AudioManager {
  /** `play` when a sound starts, `music` when the music track changes (`key` undefined: stopped). */
  readonly events = new EventBus<AudioEvents>();
  /** Listener position for positioned sounds; the scene sets it to the camera center. */
  listener: Point = { x: 0, y: 0 };
  /** Sounds played since the game started, newest last (last 50). For tests and the debug overlay. */
  readonly history: string[] = [];
  private context: AudioContext | undefined;
  private buses = new Map<Bus, GainNode>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly volumes: Record<Bus, number>;
  private current: { key: string; handle: SoundHandle } | undefined;
  private readonly positioned = new Set<{
    at: Point;
    range: number;
    panner: StereoPannerNode;
    gain: GainNode;
  }>();

  constructor(
    private readonly assets: AssetStore,
    private readonly settings?: AudioSettings,
  ) {
    this.volumes = {
      master: 1,
      music: 0.8,
      sfx: 1,
      voice: 1,
      ui: 0.8,
      ...settings?.get<Record<Bus, number>>(VOLUMES_SETTING),
    };
    assets.decodeAudio = (path, url) => this.decode(path, url);
  }

  /** The Web Audio context, created on first use. */
  get ctx(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      const master = this.context.createGain();
      master.connect(this.context.destination);
      this.buses.set('master', master);
      for (const bus of BUSES.slice(1)) {
        const gain = this.context.createGain();
        gain.connect(master);
        this.buses.set(bus, gain);
      }
      for (const bus of BUSES) this.buses.get(bus)!.gain.value = this.volumes[bus];
    }
    return this.context;
  }

  /** Resumes the context on the first user gesture. */
  attach(target: EventTarget = window): void {
    const unlock = () => {
      void this.ctx.resume();
      for (const name of ['pointerdown', 'keydown', 'touchend'])
        target.removeEventListener(name, unlock);
    };
    for (const name of ['pointerdown', 'keydown', 'touchend'])
      target.addEventListener(name, unlock);
  }

  /** `true` once the browser allows sound. */
  get unlocked(): boolean {
    return this.context?.state === 'running';
  }

  /** Suspends or resumes all sound (the game pauses on blur). */
  /**
   * Suspends or resumes all sound (window hidden), or with `{ ui: true }` only the game buses:
   * music, sfx and voice fade out while the `ui` bus keeps playing (pause menus).
   */
  setPaused(paused: boolean, options: { ui?: boolean } = {}): void {
    if (!this.context) return;
    if (!options.ui) {
      void (paused ? this.context.suspend() : this.context.resume());
      return;
    }
    const now = this.context.currentTime;
    for (const bus of ['music', 'sfx', 'voice'] as const) {
      const gain = this.buses.get(bus)!.gain;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(paused ? 0 : this.volumes[bus], now, 0.05);
    }
  }

  /** Gets or sets a bus volume (0–1); saved with the settings. */
  volume(bus: Bus, value?: number): number {
    if (value !== undefined) {
      this.volumes[bus] = clamp(value, 0, 2);
      const gain = this.buses.get(bus);
      if (gain && this.context)
        gain.gain.setTargetAtTime(this.volumes[bus], this.context.currentTime, 0.015);
      this.settings?.set(VOLUMES_SETTING, this.volumes);
    }
    return this.volumes[bus];
  }

  /**
   * Decodes one file. A format the browser cannot decode (Ogg on old iOS) is skipped with a
   * warning: another format of the same sound plays instead.
   */
  private async decode(path: string, url: string): Promise<void> {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      this.buffers.set(path, await this.ctx.decodeAudioData(data));
    } catch (error) {
      console.warn(
        `[blacklight] Cannot decode ${path} in this browser; other formats of it are used.`,
        error,
      );
    }
  }

  /** Picks the file this browser plays best among the formats of one sound. */
  private pick(paths: string[]): string {
    if (paths.length === 1) return paths[0]!;
    const probe = typeof document === 'undefined' ? undefined : document.createElement('audio');
    const types: Record<string, string> = {
      ogg: 'audio/ogg; codecs="vorbis"',
      opus: 'audio/ogg; codecs="opus"',
      m4a: 'audio/mp4; codecs="mp4a.40.2"',
      aac: 'audio/aac',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      webm: 'audio/webm',
      flac: 'audio/flac',
    };
    const ranked = [...paths].sort(
      (a, b) => AUDIO_EXTENSIONS.indexOf(extension(a)) - AUDIO_EXTENSIONS.indexOf(extension(b)),
    );
    return ranked.find((p) => probe?.canPlayType(types[extension(p)] ?? '')) ?? ranked[0]!;
  }

  /** Project paths of a sound key, for preloading. */
  resolve(key: AssetKey, preferDirs: string[] = []): string[] {
    return this.assets.find(key, { preferDirs, extensions: AUDIO_EXTENSIONS });
  }

  /**
   * Plays a sound by key (file name) or path. The file must be loaded (scene `static assets`, or
   * any file under the scene's own `assets/` folder, which the scene preloads).
   */
  play(key: AssetKey, options: PlayOptions = {}, preferDirs: string[] = []): SoundHandle {
    const paths = this.resolve(key, preferDirs);
    const path = this.pick(
      paths.filter((p) => this.buffers.has(p)).length > 0
        ? paths.filter((p) => this.buffers.has(p))
        : paths,
    );
    const buffer = this.buffers.get(path);
    if (!buffer)
      throw new Error(
        `Sound "${key}" (${path}) is not loaded. Add it to the scene's \`static assets\`.`,
      );
    const bus = options.bus ?? 'sfx';
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate ?? 1;
    source.loop = options.loop ?? false;
    if (options.loopStart !== undefined) source.loopStart = options.loopStart;
    if (options.loopEnd !== undefined) source.loopEnd = options.loopEnd;
    const gain = ctx.createGain();
    const volume = options.volume ?? 1;
    let tail: AudioNode = gain;
    source.connect(gain);
    let entry: { at: Point; range: number; panner: StereoPannerNode; gain: GainNode } | undefined;
    if (options.at) {
      const panner = ctx.createStereoPanner();
      const distanceGain = ctx.createGain();
      gain.connect(distanceGain).connect(panner);
      tail = panner;
      entry = { at: { ...options.at }, range: options.range ?? 1200, panner, gain: distanceGain };
      this.positioned.add(entry);
      this.applyPosition(entry);
    }
    tail.connect(this.buses.get(bus)!);
    const now = ctx.currentTime;
    if (options.fade) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + options.fade / 1000);
    } else {
      gain.gain.value = volume;
    }
    source.start();
    let finish: () => void = () => {};
    const ended = new Promise<void>((resolve) => (finish = resolve));
    source.onended = () => {
      if (entry) this.positioned.delete(entry);
      gain.disconnect();
      finish();
    };
    const name = typeof key === 'string' ? key : String(key);
    this.history.push(name);
    if (this.history.length > 50) this.history.shift();
    this.events.emit('play', { key: name, bus });
    return {
      key: name,
      ended,
      stop: (fade = 0) => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fade / 1000);
        source.stop(t + fade / 1000 + 0.01);
      },
      setVolume: (value, fade = 0) => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(value, t + Math.max(fade, 10) / 1000);
      },
      setPosition: (at) => {
        if (!entry) return;
        entry.at = { ...at };
        this.applyPosition(entry);
      },
    };
  }

  /**
   * Plays music on the music bus, looping. The previous track fades out while this one fades in
   * (`fade` ms). Playing the track already playing does nothing.
   */
  music(
    key: AssetKey,
    options: Omit<PlayOptions, 'bus' | 'at'> = {},
    preferDirs: string[] = [],
  ): SoundHandle {
    if (this.current?.key === key) return this.current.handle;
    const fade = options.fade ?? 0;
    this.current?.handle.stop(fade);
    const handle = this.play(key, { loop: true, ...options, bus: 'music', fade }, preferDirs);
    this.current = { key: String(key), handle };
    this.events.emit('music', { key: String(key) });
    return handle;
  }

  /** Stops the music, fading out over `fade` ms. */
  stopMusic(options: { fade?: number } = {}): void {
    this.current?.handle.stop(options.fade ?? 0);
    this.current = undefined;
    this.events.emit('music', { key: undefined });
  }

  /** Key of the music playing. */
  get currentMusic(): string | undefined {
    return this.current?.key;
  }

  /** @internal Updates positioned sounds after the listener moved. */
  updateListener(listener: Point): void {
    this.listener = { ...listener };
    for (const entry of this.positioned) this.applyPosition(entry);
  }

  private applyPosition(entry: {
    at: Point;
    range: number;
    panner: StereoPannerNode;
    gain: GainNode;
  }): void {
    const dx = entry.at.x - this.listener.x;
    const dy = entry.at.y - this.listener.y;
    entry.panner.pan.value = clamp(dx / (entry.range / 2), -1, 1);
    entry.gain.gain.value = clamp(1 - Math.hypot(dx, dy) / entry.range, 0, 1);
  }
}
