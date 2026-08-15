/**
 * Scientific pitch names in, MIDI numbers and hertz out. Every pitch in the
 * score is written the way a musician writes it — `"A2"`, `"F#4"`, `"Bb3"` —
 * so the composition stays readable and MIDI export is a lookup, not a search.
 */

/** A scientific pitch name: letter, optional accidental, octave. */
export type NoteName = string;

const LETTERS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACCIDENTALS: Record<string, number> = { "": 0, "#": 1, b: -1 };

const NOTE_PATTERN = /^([A-G])([#b]?)(-?\d+)$/;

/** MIDI 69 is A4, and A4 is 440 Hz: the anchor the whole scale hangs from. */
const A4_MIDI = 69;
const A4_HZ = 440;
const SEMITONES_PER_OCTAVE = 12;

/** MIDI note number for a pitch name. Throws on anything unparseable. */
export const midiOf = (name: NoteName): number => {
  const match = NOTE_PATTERN.exec(name);
  if (!match) {
    throw new RangeError(`not a pitch name: ${name}`);
  }
  const [, letter, accidental, octave] = match;
  return (
    (Number(octave) + 1) * SEMITONES_PER_OCTAVE +
    LETTERS[letter] +
    ACCIDENTALS[accidental]
  );
};

const midiToHz = (midi: number): number =>
  A4_HZ * 2 ** ((midi - A4_MIDI) / SEMITONES_PER_OCTAVE);

/**
 * Hertz for a pitch name, optionally shifted. `semitones` takes fractions, so
 * `0.08` is an eight-cent detune rather than a note change.
 */
export const frequencyOf = (name: NoteName, semitones = 0): number =>
  midiToHz(midiOf(name) + semitones);

/** Pitch class 0–11, where 0 is C. Used to check a note is in key. */
export const pitchClassOf = (name: NoteName): number =>
  ((midiOf(name) % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) %
  SEMITONES_PER_OCTAVE;
