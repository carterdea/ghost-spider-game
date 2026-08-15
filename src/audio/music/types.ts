/**
 * The shape of the score. This is note data — the same information a MIDI file
 * carries — kept as plain TypeScript so it can be read, edited and diffed.
 */

import type { NoteName } from "./notes";

/**
 * The stems of the arrangement. Districts switch these on one at a time, so a
 * run escalates through one piece instead of cutting between five.
 */
export type MusicLayer = "pad" | "bass" | "arp" | "lead" | "pulse" | "stab";

/** One note. Times are in beats, where 1 beat is a quarter note. */
export interface NoteEvent {
  /** Offset from the start of the loop. */
  readonly beat: number;
  readonly note: NoteName;
  /** Written length in beats. The instrument may cap how long it rings. */
  readonly length: number;
  /** 0–1, relative to the instrument's own gain. Defaults to 1. */
  readonly velocity?: number;
}

/**
 * One oscillator or noise band inside an instrument. Several of these stacked
 * make a timbre: a detuned pair, a saw under a triangle, a filtered sub.
 */
export interface InstrumentVoice {
  readonly source: OscillatorType | "noise";
  /** Offset from the written pitch. Fractions detune: `0.08` ≈ 8 cents. */
  readonly semitones?: number;
  /** Relative to the instrument's gain. */
  readonly gain: number;
  /** Low-pass cutoff for oscillators. Noise is band-passed at the pitch. */
  readonly cutoff?: number;
  readonly q?: number;
}

export interface Instrument {
  readonly voices: readonly InstrumentVoice[];
  /** Peak amplitude of the whole stack, before the music bus. */
  readonly gain: number;
  readonly attack: number;
  readonly release: number;
  /** Longest sustain in seconds, whatever the written length. */
  readonly maxHold?: number;
}

/** One stem: an instrument and the notes it plays across the loop. */
export interface Part {
  readonly layer: MusicLayer;
  readonly instrument: Instrument;
  readonly notes: readonly NoteEvent[];
}

export interface Song {
  readonly name: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  /** Loop length in beats. Every part wraps at this point. */
  readonly loopBeats: number;
  readonly parts: readonly Part[];
}

/** A note flattened out of its part, ready for the scheduler. */
export interface ScheduledNote {
  readonly layer: MusicLayer;
  readonly instrument: Instrument;
  readonly beat: number;
  readonly note: NoteName;
  readonly length: number;
  readonly velocity: number;
}
