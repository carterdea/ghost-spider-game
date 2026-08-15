import { clamp } from "../game/simulation/physics/vector";
import { AudioEngine, detectAudioContext } from "./engine";
import { RECIPES, type SoundEvent } from "./events";
import {
  createMusic,
  type MusicControl,
  type MusicOptions,
} from "./music/index";
import {
  detectStorage,
  type MuteStorage,
  readMuted,
  writeMuted,
} from "./preference";

export type { SoundEvent } from "./events";
export type { MusicControl, MusicOptions } from "./music/index";
// Rendering the score to a MIDI file is a capability of this module, not of the
// game: nothing in a run calls it, and `midi.test.ts` is what exercises it. Kept
// on the facade so the arrangement can be exported without reaching inside.
// fallow-ignore-next-line unused-export
export { toMidiFile } from "./music/midi";

/** Loud enough to hear over a laptop fan, quiet enough not to startle. */
const DEFAULT_VOLUME = 0.32;

export interface GameAudio {
  /** `intensity` is 0–1 and bends pitch on the events that use it. */
  play(event: SoundEvent, intensity?: number): void;
  /** 0–1 wind bed; 0 leaves it silent and never builds the nodes. */
  setWind(intensity: number): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** The score. Shares this object's mute, master volume and limiter. */
  readonly music: MusicControl;
  destroy(): void;
}

export interface AudioOptions {
  /** Master volume, 0–1. */
  volume?: number;
  /** Overrides Web Audio detection. Tests inject a fake context here. */
  createContext?: () => AudioContext | undefined;
  /** Overrides `localStorage` for the mute preference. */
  storage?: MuteStorage;
  /** Monotonic clock in milliseconds, used to throttle repeats. */
  now?: () => number;
  /** Scheduler tuning for the score. */
  music?: MusicOptions;
}

/**
 * The game's whole audio surface. Everything is synthesised at runtime, so
 * there are no assets to load and nothing to wait for.
 *
 * The AudioContext is built by the first sound the game asks for, which in
 * practice lands inside a keypress: browsers warn about — and suspend —
 * contexts created before a user gesture. Web Audio is optional throughout, so
 * with no context available every call is a silent no-op.
 */
export const createAudio = (options: AudioOptions = {}): GameAudio => {
  const now = options.now ?? (() => performance.now());
  const storage = options.storage ?? detectStorage();
  const lastPlayedAt = new Map<SoundEvent, number>();

  let muted = readMuted(storage);
  let engine: AudioEngine | undefined;
  let built = false;

  const ensureEngine = (): AudioEngine | undefined => {
    if (built) {
      return engine;
    }
    built = true;
    engine = buildEngine(options);
    if (muted) {
      engine?.setMuted(true);
    }
    return engine;
  };

  const music = createMusic(ensureEngine, options.music);
  if (muted) {
    music.setMuted(true);
  }

  const throttled = (event: SoundEvent, at: number): boolean => {
    const previous = lastPlayedAt.get(event);
    if (previous !== undefined && at - previous < RECIPES[event].minGapMs) {
      return true;
    }
    lastPlayedAt.set(event, at);
    return false;
  };

  return {
    play(event: SoundEvent, intensity = 0): void {
      if (muted || throttled(event, now())) {
        return;
      }

      const recipe = RECIPES[event];
      const bend = 1 + (recipe.pitchBend ?? 0) * clamp(intensity, 0, 1);
      ensureEngine()?.play(recipe.layers, bend);
    },

    setWind(intensity: number): void {
      // Silence on a game that has made no sound yet stays free.
      if (!built && intensity <= 0) {
        return;
      }
      ensureEngine()?.setWind(intensity);
    },

    setMuted(next: boolean): void {
      muted = next;
      writeMuted(storage, next);
      engine?.setMuted(next);
      music.setMuted(next);
    },

    isMuted: (): boolean => muted,

    music,

    destroy(): void {
      built = true;
      music.stop();
      engine?.destroy();
      engine = undefined;
      lastPlayedAt.clear();
    },
  };
};

const buildEngine = (options: AudioOptions): AudioEngine | undefined => {
  const context = (options.createContext ?? detectAudioContext)();
  if (!context) {
    return undefined;
  }
  return new AudioEngine(context, options.volume ?? DEFAULT_VOLUME);
};
