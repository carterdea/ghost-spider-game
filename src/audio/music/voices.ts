/**
 * Turns one written note into the oscillator stack the engine understands.
 * This is the only place the score meets the synth.
 */

import type { Layer } from "../events";
import { frequencyOf, type NoteName } from "./notes";
import type { Instrument } from "./types";

/**
 * `hold` is the written length in seconds; the instrument may shorten it, and
 * the attack is taken out of it so a short note still peaks where it should.
 * `gain` is the note's peak amplitude, velocity and stem level already applied.
 */
export const noteLayers = (
  instrument: Instrument,
  note: NoteName,
  hold: number,
  gain: number,
): Layer[] => {
  const sustain = Math.max(
    Math.min(hold, instrument.maxHold ?? hold) - instrument.attack,
    0,
  );
  return instrument.voices.map((voice) => ({
    source: voice.source,
    freq: frequencyOf(note, voice.semitones ?? 0),
    gain: gain * voice.gain,
    attack: instrument.attack,
    hold: sustain,
    release: instrument.release,
    cutoff: voice.cutoff,
    q: voice.q,
  }));
};

/** Peak amplitude of a note once every voice in the stack is summing. */
export const stackGain = (instrument: Instrument): number =>
  instrument.voices.reduce((total, voice) => total + voice.gain, 0) *
  instrument.gain;
