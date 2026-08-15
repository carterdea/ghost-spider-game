/**
 * "Rain on the Grid" — eight bars of A natural minor at 104 BPM, i–VI–III–VII
 * (Am–F–C–G) twice over. Every pitch in the piece is drawn from that scale, so
 * nothing here can collide with anything else here.
 *
 * The chord table below is the score's single source of truth: bass, pad, arp
 * and stab are all expanded from it, and only the lead is written out by hand.
 * Edit a voicing in one place and every stem follows.
 */

import { ARP, BASS, LEAD, PAD, PULSE, STAB } from "./instruments";
import type { NoteName } from "./notes";
import type { NoteEvent, Part, Song } from "./types";

const BPM = 104;
export const BEATS_PER_BAR = 4;
const BARS = 8;
export const LOOP_BEATS = BARS * BEATS_PER_BAR;

/** One bar of harmony. Pitches are spelled out rather than derived, so the
 *  register of every voice is visible at a glance. */
interface BarChord {
  readonly name: string;
  /** Octave-bass pair: the low root and the same note an octave up. */
  readonly bass: readonly [NoteName, NoteName];
  /** Held chord, voice-led to stay inside a fifth of the bar before it. */
  readonly pad: readonly NoteName[];
  /** Four pitches the arpeggio walks up and back down. */
  readonly arp: readonly NoteName[];
  /** The pad voicing an octave up, hit short. */
  readonly stab: readonly NoteName[];
}

const A_MINOR: BarChord = {
  name: "Am",
  bass: ["A1", "A2"],
  pad: ["A3", "C4", "E4"],
  arp: ["A4", "C5", "E5", "G5"],
  stab: ["A4", "C5", "E5"],
};

const F_MAJOR: BarChord = {
  name: "F",
  bass: ["F1", "F2"],
  pad: ["A3", "C4", "F4"],
  // F6 rather than Fmaj7: the E would sit a semitone under the lead's F5.
  arp: ["F4", "A4", "C5", "D5"],
  stab: ["A4", "C5", "F5"],
};

const C_MAJOR: BarChord = {
  name: "C",
  bass: ["C2", "C3"],
  pad: ["G3", "C4", "E4"],
  arp: ["B4", "C5", "E5", "G5"],
  stab: ["G4", "C5", "E5"],
};

const G_MAJOR: BarChord = {
  name: "G",
  bass: ["G1", "G2"],
  pad: ["G3", "B3", "D4"],
  arp: ["G4", "B4", "D5", "F5"],
  stab: ["G4", "B4", "D5"],
};

/** Two passes of the same four bars. The lead is what makes them differ. */
const PROGRESSION: readonly BarChord[] = [
  A_MINOR,
  F_MAJOR,
  C_MAJOR,
  G_MAJOR,
  A_MINOR,
  F_MAJOR,
  C_MAJOR,
  G_MAJOR,
];

/** Eighth notes, octave up on the third, sixth and eighth. */
const BASS_STEPS: readonly { beat: number; high: boolean }[] = [
  { beat: 0, high: false },
  { beat: 0.5, high: false },
  { beat: 1, high: true },
  { beat: 1.5, high: false },
  { beat: 2, high: false },
  { beat: 2.5, high: true },
  { beat: 3, high: false },
  { beat: 3.5, high: true },
];

/** Up and back down the four chord tones, one per eighth note. */
const ARP_SHAPE: readonly number[] = [0, 1, 2, 3, 2, 1, 0, 1];

/**
 * A push into the next bar: one on the "and" of three, one on the last
 * sixteenth. The second is clipped to the bar line — let it hang over and its
 * dominant seventh rubs against the next downbeat.
 */
const STAB_HITS: readonly { beat: number; length: number; velocity: number }[] =
  [
    { beat: 2.5, length: 0.4, velocity: 1 },
    { beat: 3.75, length: 0.25, velocity: 0.7 },
  ];

/** Offbeat hat, with a ghosted sixteenth ahead of the bar line. */
const PULSE_STEPS: readonly {
  beat: number;
  note: NoteName;
  velocity: number;
}[] = [
  { beat: 0.5, note: "A7", velocity: 0.8 },
  { beat: 1.5, note: "D7", velocity: 0.55 },
  { beat: 2.5, note: "A7", velocity: 0.8 },
  { beat: 3.5, note: "D7", velocity: 0.55 },
  { beat: 3.75, note: "A7", velocity: 0.35 },
];

const barStart = (bar: number): number => bar * BEATS_PER_BAR;

const eachBar = (
  build: (chord: BarChord, bar: number) => readonly NoteEvent[],
): NoteEvent[] => PROGRESSION.flatMap(build);

const bassNotes = (): NoteEvent[] =>
  eachBar((chord, bar) =>
    BASS_STEPS.map(({ beat, high }) => ({
      beat: barStart(bar) + beat,
      note: chord.bass[high ? 1 : 0],
      length: 0.45,
      velocity: high ? 0.85 : 1,
    })),
  );

const padNotes = (): NoteEvent[] =>
  eachBar((chord, bar) =>
    chord.pad.map((note) => ({
      beat: barStart(bar),
      note,
      length: BEATS_PER_BAR,
    })),
  );

const arpNotes = (): NoteEvent[] =>
  eachBar((chord, bar) =>
    ARP_SHAPE.map((step, index) => ({
      beat: barStart(bar) + index * 0.5,
      note: chord.arp[step],
      length: 0.45,
      // Lean on the downbeat so the shape has a shoulder rather than a wall.
      velocity: index % 2 === 0 ? 1 : 0.7,
    })),
  );

const stabNotes = (): NoteEvent[] =>
  eachBar((chord, bar) =>
    STAB_HITS.flatMap(({ beat, length, velocity }) =>
      chord.stab.map((note) => ({
        beat: barStart(bar) + beat,
        note,
        length,
        velocity,
      })),
    ),
  );

const pulseNotes = (): NoteEvent[] =>
  eachBar((_chord, bar) =>
    PULSE_STEPS.map(({ beat, note, velocity }) => ({
      beat: barStart(bar) + beat,
      note,
      length: 0.1,
      velocity,
    })),
  );

/**
 * The tune. Bars 1–4 state it around E5–A5; bars 5–8 answer an octave-ish
 * higher and land on B4, leaving half a beat of air before the loop point so
 * the seam arrives as a breath rather than a bump.
 */
const leadNotes = (): NoteEvent[] =>
  (
    [
      [0, 0, "E5", 2],
      [0, 2, "A5", 2],
      [1, 0, "G5", 1.5],
      [1, 1.5, "F5", 2.5],
      [2, 0, "E5", 2],
      [2, 2, "G5", 2],
      [3, 0, "D5", 1.5],
      [3, 1.5, "B4", 1.5],
      [3, 3, "D5", 1],
      [4, 0, "A5", 1.5],
      [4, 1.5, "E5", 1],
      [4, 2.5, "A5", 1.5],
      [5, 0, "C6", 2],
      [5, 2, "A5", 2],
      [6, 0, "G5", 1.5],
      [6, 1.5, "E5", 1.5],
      [6, 3, "G5", 1],
      [7, 0, "D5", 2],
      [7, 2, "B4", 1.5],
    ] as const
  ).map(([bar, beat, note, length]) => ({
    beat: barStart(bar) + beat,
    note,
    length,
  }));

const PARTS: readonly Part[] = [
  { layer: "pad", instrument: PAD, notes: padNotes() },
  { layer: "bass", instrument: BASS, notes: bassNotes() },
  { layer: "arp", instrument: ARP, notes: arpNotes() },
  { layer: "lead", instrument: LEAD, notes: leadNotes() },
  { layer: "pulse", instrument: PULSE, notes: pulseNotes() },
  { layer: "stab", instrument: STAB, notes: stabNotes() },
];

export const SONG: Song = {
  name: "Rain on the Grid",
  bpm: BPM,
  beatsPerBar: BEATS_PER_BAR,
  loopBeats: LOOP_BEATS,
  parts: PARTS,
};
