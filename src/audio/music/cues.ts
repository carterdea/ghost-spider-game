/**
 * Two short one-shots that replace the loop at the end of a run. Both stay in
 * A minor and both sit deliberately below the matching effect in `events.ts`:
 * `levelCleared` sparkles at C5–C6, so the chime answers it from A3–C5, and
 * `knockedOut` slides 300 Hz down to 40 Hz, so the sag hangs above it at E3–A3.
 */

import { CHIME, SAG } from "./instruments";
import type { NoteName } from "./notes";
import type { Instrument } from "./types";

export type MusicCue = "levelCleared" | "knockedOut";

/** Cue notes are placed in seconds, not beats: they are gestures, not bars. */
export interface CueNote {
  readonly at: number;
  readonly note: NoteName;
  /** Time held at full gain before the instrument's release. */
  readonly hold: number;
  readonly velocity?: number;
}

export interface CueRecipe {
  readonly instrument: Instrument;
  readonly notes: readonly CueNote[];
}

export const CUES: Record<MusicCue, CueRecipe> = {
  // Am walked up into C: the minor home resolving to its relative major.
  levelCleared: {
    instrument: CHIME,
    notes: [
      { at: 0, note: "A3", hold: 0.12, velocity: 0.8 },
      { at: 0.16, note: "C4", hold: 0.12, velocity: 0.85 },
      { at: 0.32, note: "E4", hold: 0.12, velocity: 0.9 },
      { at: 0.48, note: "A4", hold: 0.2 },
      { at: 0.72, note: "C5", hold: 0.9 },
      { at: 0.72, note: "E4", hold: 0.9, velocity: 0.5 },
    ],
  },
  // The line sags home: A down to E over a root that will not let go.
  knockedOut: {
    instrument: SAG,
    notes: [
      { at: 0, note: "A2", hold: 1.6, velocity: 0.55 },
      { at: 0, note: "A3", hold: 0.3 },
      { at: 0.34, note: "G3", hold: 0.3, velocity: 0.85 },
      { at: 0.68, note: "F3", hold: 0.3, velocity: 0.7 },
      { at: 1.02, note: "E3", hold: 1.1, velocity: 0.6 },
    ],
  },
};
