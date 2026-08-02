/**
 * The sound palette: neon, rain-slick, synthetic. Every voice is a stack of
 * short oscillator or filtered-noise layers — no samples, no asset pipeline.
 */

/** Every moment in the game that makes a noise. */
export type SoundEvent =
  | "webAttach"
  | "webRelease"
  | "swing"
  | "jump"
  | "land"
  | "footstep"
  | "melee"
  | "webShot"
  | "gadgetNet"
  | "gadgetShield"
  | "gadgetWings"
  | "gadgetCycle"
  | "enemyShot"
  | "enemyHit"
  | "enemySnared"
  | "enemyDefeated"
  | "shieldBlock"
  | "playerHurt"
  | "levelAdvance"
  | "levelCleared"
  | "knockedOut";

/** One oscillator or noise band inside a voice. Times are in seconds. */
export interface Layer {
  /** `noise` swaps the oscillator for band-passed white noise. */
  source: OscillatorType | "noise";
  /** Oscillator pitch, or the band-pass centre for a noise layer, in Hz. */
  freq: number;
  /** Frequency glided to by the end of the layer. Defaults to `freq`. */
  glide?: number;
  /** Peak amplitude, before the master volume. */
  gain: number;
  attack: number;
  /** Time held at full gain between attack and release. Defaults to none. */
  hold?: number;
  release: number;
  /** Start offset from the trigger, for arpeggios and double hits. */
  delay?: number;
  /** Low-pass cutoff in Hz. Oscillator layers only; noise is already banded. */
  cutoff?: number;
  /** Filter resonance: the band-pass Q for noise, the low-pass Q for `cutoff`. */
  q?: number;
}

export interface Recipe {
  layers: readonly Layer[];
  /** Shortest gap between two triggers of this event, in milliseconds. */
  minGapMs: number;
  /** Pitch bend at full intensity: `1` means an octave up. Defaults to none. */
  pitchBend?: number;
}

export const RECIPES: Record<SoundEvent, Recipe> = {
  // Thwip: a hiss that snaps shut, plus a low click as the line goes taut.
  webAttach: {
    minGapMs: 90,
    layers: [
      {
        source: "noise",
        freq: 2600,
        glide: 900,
        gain: 0.34,
        attack: 0.002,
        release: 0.12,
        q: 2.2,
      },
      {
        source: "square",
        freq: 620,
        glide: 180,
        gain: 0.14,
        attack: 0.002,
        release: 0.1,
      },
    ],
  },
  // The line cuts loose: same hiss, running upward instead of down.
  webRelease: {
    minGapMs: 90,
    layers: [
      {
        source: "noise",
        freq: 1200,
        glide: 3200,
        gain: 0.2,
        attack: 0.004,
        release: 0.09,
        q: 1.6,
      },
      {
        source: "sine",
        freq: 300,
        glide: 900,
        gain: 0.1,
        attack: 0.004,
        release: 0.1,
      },
    ],
  },
  // Air past the mask. Intensity is swing speed, so fast arcs sing higher.
  swing: {
    minGapMs: 260,
    pitchBend: 1,
    layers: [
      {
        source: "noise",
        freq: 420,
        glide: 900,
        gain: 0.16,
        attack: 0.11,
        release: 0.3,
        q: 1.1,
      },
    ],
  },
  jump: {
    minGapMs: 110,
    layers: [
      {
        source: "triangle",
        freq: 220,
        glide: 680,
        gain: 0.18,
        attack: 0.005,
        release: 0.17,
      },
      {
        source: "noise",
        freq: 900,
        gain: 0.07,
        attack: 0.002,
        release: 0.06,
        q: 1,
      },
    ],
  },
  // Boots on wet concrete: a body thump under a short slap of noise.
  land: {
    minGapMs: 140,
    layers: [
      {
        source: "sine",
        freq: 170,
        glide: 60,
        gain: 0.26,
        attack: 0.003,
        release: 0.18,
      },
      {
        source: "noise",
        freq: 380,
        gain: 0.14,
        attack: 0.002,
        release: 0.12,
        q: 0.8,
      },
    ],
  },
  footstep: {
    minGapMs: 190,
    layers: [
      {
        source: "noise",
        freq: 1100,
        glide: 700,
        gain: 0.08,
        attack: 0.001,
        release: 0.05,
        q: 1.6,
      },
    ],
  },
  melee: {
    minGapMs: 110,
    layers: [
      {
        source: "square",
        freq: 190,
        glide: 70,
        gain: 0.2,
        attack: 0.002,
        release: 0.13,
      },
      {
        source: "noise",
        freq: 2600,
        glide: 700,
        gain: 0.24,
        attack: 0.001,
        release: 0.08,
        q: 0.9,
      },
    ],
  },
  webShot: {
    minGapMs: 110,
    layers: [
      {
        source: "sawtooth",
        freq: 900,
        glide: 300,
        gain: 0.13,
        attack: 0.002,
        release: 0.12,
      },
      {
        source: "noise",
        freq: 3000,
        glide: 1500,
        gain: 0.14,
        attack: 0.001,
        release: 0.07,
        q: 1.4,
      },
    ],
  },
  gadgetNet: {
    minGapMs: 160,
    layers: [
      {
        source: "sawtooth",
        freq: 520,
        glide: 160,
        gain: 0.14,
        attack: 0.004,
        release: 0.22,
      },
      {
        source: "noise",
        freq: 1800,
        glide: 600,
        gain: 0.16,
        attack: 0.004,
        release: 0.2,
        q: 1.4,
      },
    ],
  },
  // Shield and wings both shimmer upward; the shield holds, the wings leap.
  gadgetShield: {
    minGapMs: 160,
    layers: [
      {
        source: "sine",
        freq: 440,
        glide: 880,
        gain: 0.16,
        attack: 0.012,
        release: 0.34,
      },
      {
        source: "triangle",
        freq: 660,
        glide: 1320,
        gain: 0.08,
        attack: 0.012,
        release: 0.3,
        delay: 0.05,
      },
    ],
  },
  gadgetWings: {
    minGapMs: 160,
    layers: [
      {
        source: "sine",
        freq: 300,
        glide: 1200,
        gain: 0.15,
        attack: 0.01,
        release: 0.3,
      },
      {
        source: "noise",
        freq: 700,
        glide: 2200,
        gain: 0.1,
        attack: 0.01,
        release: 0.26,
        q: 1.2,
      },
    ],
  },
  gadgetCycle: {
    minGapMs: 90,
    layers: [
      {
        source: "square",
        freq: 880,
        glide: 1320,
        gain: 0.07,
        attack: 0.002,
        release: 0.07,
      },
    ],
  },
  // Enemies fire often, so this one stays quiet and short on purpose.
  enemyShot: {
    minGapMs: 80,
    layers: [
      {
        source: "sawtooth",
        freq: 700,
        glide: 260,
        gain: 0.08,
        attack: 0.002,
        release: 0.1,
      },
    ],
  },
  enemyHit: {
    minGapMs: 80,
    layers: [
      {
        source: "square",
        freq: 300,
        glide: 120,
        gain: 0.15,
        attack: 0.002,
        release: 0.1,
      },
      {
        source: "noise",
        freq: 1600,
        glide: 900,
        gain: 0.13,
        attack: 0.001,
        release: 0.07,
        q: 1,
      },
    ],
  },
  enemySnared: {
    minGapMs: 140,
    layers: [
      {
        source: "noise",
        freq: 2200,
        glide: 700,
        gain: 0.15,
        attack: 0.006,
        release: 0.26,
        q: 2,
      },
      {
        source: "triangle",
        freq: 240,
        glide: 120,
        gain: 0.09,
        attack: 0.006,
        release: 0.2,
      },
    ],
  },
  enemyDefeated: {
    minGapMs: 140,
    layers: [
      {
        source: "sawtooth",
        freq: 420,
        glide: 60,
        gain: 0.18,
        attack: 0.004,
        release: 0.32,
      },
      {
        source: "noise",
        freq: 900,
        glide: 200,
        gain: 0.16,
        attack: 0.003,
        release: 0.3,
        q: 0.9,
      },
    ],
  },
  shieldBlock: {
    minGapMs: 110,
    layers: [
      {
        source: "sine",
        freq: 900,
        glide: 1500,
        gain: 0.14,
        attack: 0.003,
        release: 0.18,
      },
      {
        source: "noise",
        freq: 3000,
        gain: 0.1,
        attack: 0.001,
        release: 0.08,
        q: 3,
      },
    ],
  },
  playerHurt: {
    minGapMs: 260,
    layers: [
      {
        source: "sawtooth",
        freq: 220,
        glide: 90,
        gain: 0.22,
        attack: 0.004,
        release: 0.3,
      },
      {
        source: "noise",
        freq: 500,
        glide: 180,
        gain: 0.15,
        attack: 0.004,
        release: 0.22,
        q: 0.7,
      },
    ],
  },
  // District cleared: a rising three-note figure, C-E-A.
  levelAdvance: {
    minGapMs: 600,
    layers: [
      {
        source: "sine",
        freq: 523,
        gain: 0.14,
        attack: 0.01,
        release: 0.3,
      },
      {
        source: "sine",
        freq: 659,
        gain: 0.14,
        attack: 0.01,
        release: 0.32,
        delay: 0.1,
      },
      {
        source: "triangle",
        freq: 880,
        gain: 0.12,
        attack: 0.01,
        release: 0.5,
        delay: 0.2,
      },
    ],
  },
  // Run cleared: the same figure, wider, over a slow synth pad.
  levelCleared: {
    minGapMs: 1200,
    layers: [
      {
        source: "sawtooth",
        freq: 262,
        glide: 523,
        gain: 0.08,
        attack: 0.2,
        release: 1.2,
      },
      {
        source: "sine",
        freq: 523,
        gain: 0.14,
        attack: 0.01,
        release: 0.36,
      },
      {
        source: "sine",
        freq: 784,
        gain: 0.14,
        attack: 0.01,
        release: 0.4,
        delay: 0.14,
      },
      {
        source: "triangle",
        freq: 1046,
        gain: 0.13,
        attack: 0.01,
        release: 0.8,
        delay: 0.28,
      },
    ],
  },
  // Everything sags and drops out.
  knockedOut: {
    minGapMs: 900,
    layers: [
      {
        source: "sawtooth",
        freq: 300,
        glide: 40,
        gain: 0.24,
        attack: 0.01,
        release: 1.1,
      },
      {
        source: "noise",
        freq: 600,
        glide: 80,
        gain: 0.16,
        attack: 0.01,
        release: 0.9,
        q: 0.8,
      },
    ],
  },
};
