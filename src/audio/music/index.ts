/**
 * The score's public surface: start it, tell it which district you are in, and
 * fire a cue when the run ends. Everything underneath runs on the same
 * `AudioEngine` as the effects, so one mute and one master volume cover both.
 */

import type { AudioEngine } from "../engine";
import { MUSIC_LEVEL } from "../engine";
import { CUES, type MusicCue } from "./cues";
import { DEFAULT_INTERVAL_MS, Sequencer } from "./sequencer";
import { SONG } from "./song";
import { IDLE_TIER, tierForDistrict } from "./tiers";
import type { MusicLayer, ScheduledNote } from "./types";
import { noteLayers } from "./voices";

export type { MusicCue } from "./cues";
export { TICKS_PER_BEAT, toMidiFile } from "./midi";
export { SONG } from "./song";
export { DISTRICT_TIERS, IDLE_TIER, tierForDistrict } from "./tiers";
export type { MusicLayer, Song } from "./types";

/** The loop eases in rather than snapping on. */
const START_FADE = 2.4;
const STOP_FADE = 0.6;
/** Long enough to swallow the loop's tail, short enough to feel like a beat. */
const CUE_GAP = 0.35;
const CUE_RISE = 0.08;
/** Beat zero lands here, so the first note is scheduled rather than fired. */
const START_LEAD = 0.08;

/** Cancels a repeating timer. */
export type StopTimer = () => void;

export interface MusicOptions {
  /** How often the scheduler wakes, in milliseconds. */
  readonly intervalMs?: number;
  /** How far ahead of the clock notes are scheduled, in seconds. */
  readonly lookaheadSeconds?: number;
  /** Overrides `setInterval`. Tests drive the pump from a fake clock. */
  readonly timer?: (tick: () => void, ms: number) => StopTimer;
}

export interface Music {
  start(): void;
  stop(): void;
  /** `index` is `progression.levelIndex`; out-of-range values clamp. */
  setDistrict(index: number): void;
  /** Drops to the title bed — the pad alone. */
  setIdle(): void;
  /** Ends the loop and plays a short figure in its place. */
  cue(cue: MusicCue): void;
  isPlaying(): boolean;
  /** Driven by `GameAudio.setMuted`; callers do not need this. */
  setMuted(muted: boolean): void;
}

/** Everything but the mute, which the audio facade owns. */
export type MusicControl = Omit<Music, "setMuted">;

const defaultTimer = (tick: () => void, ms: number): StopTimer => {
  const handle = setInterval(tick, ms);
  return () => clearInterval(handle);
};

/**
 * `getEngine` is the facade's lazy builder: the context only exists after a
 * user gesture, so the score asks for it at `start` rather than at creation.
 */
export const createMusic = (
  getEngine: () => AudioEngine | undefined,
  options: MusicOptions = {},
): Music => {
  const secondsPerBeat = 60 / SONG.bpm;
  let engine: AudioEngine | undefined;
  let stopTimer: StopTimer | undefined;
  let muted = false;
  let wanted = false;

  const play = (note: ScheduledNote, at: number, level: number): void => {
    const layers = noteLayers(
      note.instrument,
      note.note,
      note.length * secondsPerBeat,
      note.instrument.gain * note.velocity * level,
    );
    engine?.scheduleMusic(layers, at);
  };

  const sequencer = new Sequencer(SONG, play, options);
  sequencer.setLayers(IDLE_TIER);

  const stopPump = (): void => {
    stopTimer?.();
    stopTimer = undefined;
  };

  const startPump = (): void => {
    if (stopTimer || !engine) {
      return;
    }
    const tick = (): void => {
      if (engine) {
        sequencer.pump(engine.currentTime);
      }
    };
    stopTimer = (options.timer ?? defaultTimer)(
      tick,
      options.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    tick();
  };

  /** Runs the loop only when it is both wanted and audible. */
  const sync = (): void => {
    if (!wanted || muted) {
      if (sequencer.isRunning) {
        sequencer.stop();
        engine?.setMusicLevel(0, STOP_FADE);
      }
      stopPump();
      return;
    }
    engine = getEngine();
    if (!engine || sequencer.isRunning) {
      return;
    }
    sequencer.start(engine.currentTime + START_LEAD);
    engine.setMusicLevel(MUSIC_LEVEL, START_FADE);
    startPump();
  };

  return {
    start(): void {
      wanted = true;
      sync();
    },

    stop(): void {
      wanted = false;
      sync();
    },

    setDistrict(index: number): void {
      sequencer.setLayers(tierForDistrict(index));
    },

    setIdle(): void {
      sequencer.setLayers(IDLE_TIER);
    },

    cue(name: MusicCue): void {
      wanted = false;
      sync();
      if (muted) {
        return;
      }
      // A cue can land on a run that never started the loop, so ask again.
      engine ??= getEngine();
      if (!engine) {
        return;
      }
      const { instrument, notes } = CUES[name];
      const from = engine.currentTime + CUE_GAP;
      engine.setMusicLevel(MUSIC_LEVEL, CUE_RISE, from - CUE_RISE);
      for (const note of notes) {
        const layers = noteLayers(
          instrument,
          note.note,
          note.hold,
          instrument.gain * (note.velocity ?? 1),
        );
        engine.scheduleMusic(layers, from + note.at);
      }
    },

    isPlaying: (): boolean => sequencer.isRunning,

    setMuted(next: boolean): void {
      muted = next;
      sync();
    },
  };
};

/** Stems in arrangement order, for tests and tooling. */
export const LAYER_ORDER: readonly MusicLayer[] = SONG.parts.map(
  (part) => part.layer,
);
