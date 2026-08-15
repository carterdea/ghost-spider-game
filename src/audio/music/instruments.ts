/**
 * The voices of the score, cut from the same cloth as the effect palette in
 * `events.ts`: filtered saws, soft triangles, band-passed noise. Gains are
 * deliberately small — everything here sums inside one music bus that already
 * sits under the effects.
 */

import type { Instrument } from "./types";

/** A wide, slow bed. Two triangles a few cents apart give it drift. */
export const PAD: Instrument = {
  voices: [
    { source: "triangle", gain: 1, cutoff: 1500 },
    { source: "triangle", semitones: 0.07, gain: 0.6, cutoff: 1200 },
  ],
  gain: 0.032,
  attack: 0.55,
  // The tail has to reach into the next bar or the bed gaps, but much past a
  // second and the old chord is still ringing when the new one has landed.
  release: 0.9,
  maxHold: 3.5,
};

/** Driving octave bass: a saw through a tight low-pass, with the sine under it
 *  so the line still reads on a laptop speaker that cannot move 50 Hz. */
export const BASS: Instrument = {
  voices: [
    { source: "sawtooth", gain: 1, cutoff: 620, q: 1.1 },
    { source: "sine", gain: 0.45 },
  ],
  gain: 0.18,
  attack: 0.006,
  release: 0.1,
  maxHold: 0.45,
};

/** Short plucks. The square is a hint of edge, not a second voice. */
export const ARP: Instrument = {
  voices: [
    { source: "triangle", gain: 1 },
    { source: "square", gain: 0.22, cutoff: 2600 },
  ],
  gain: 0.055,
  attack: 0.004,
  release: 0.16,
  maxHold: 0.3,
};

/** A detuned saw pair, filtered down so it sings rather than buzzes. */
export const LEAD: Instrument = {
  voices: [
    { source: "sawtooth", gain: 1, cutoff: 2100, q: 0.9 },
    { source: "sawtooth", semitones: 0.09, gain: 0.7, cutoff: 1800, q: 0.9 },
  ],
  gain: 0.075,
  attack: 0.035,
  release: 0.45,
  maxHold: 2.2,
};

/** A hat. Noise takes the written pitch as its band-pass centre, so the
 *  pulse part is written high — `"A7"` is a bright tick, `"D7"` a duller one. */
export const PULSE: Instrument = {
  voices: [{ source: "noise", gain: 1, q: 1.4 }],
  gain: 0.03,
  attack: 0.001,
  release: 0.055,
  maxHold: 0.06,
};

/** Offbeat chord hits. Short enough to push the bar without filling it. */
export const STAB: Instrument = {
  voices: [
    { source: "sawtooth", gain: 1, cutoff: 1800, q: 1 },
    { source: "sawtooth", semitones: 0.12, gain: 0.4, cutoff: 1500 },
  ],
  gain: 0.03,
  attack: 0.006,
  release: 0.22,
  maxHold: 0.28,
};

/** The cleared cue: a bell that rings under the effect's sparkle. */
export const CHIME: Instrument = {
  voices: [
    { source: "triangle", gain: 1 },
    { source: "sine", semitones: 12, gain: 0.3 },
  ],
  gain: 0.11,
  attack: 0.01,
  release: 0.9,
};

/** The knocked-out cue: the same synth as the bass, sagging. */
export const SAG: Instrument = {
  voices: [
    { source: "sawtooth", gain: 1, cutoff: 900 },
    { source: "triangle", gain: 0.5 },
  ],
  gain: 0.1,
  attack: 0.02,
  release: 1.1,
};
