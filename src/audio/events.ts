/**
 * The sound palette: neon, rain-slick, synthetic. Every voice is a stack of
 * short oscillator or filtered-noise layers — no samples, no asset pipeline.
 */

/** Every moment in the game that makes a noise. */
export type SoundEvent =
  | "webAttach"
  | "webLaunch"
  | "webRelease"
  | "swing"
  | "comboUp"
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
  | "knockedOut"
  | "bossWake"
  | "bossPhaseShift"
  | "bossVolley"
  | "bossSlam"
  | "bossNova"
  | "bossStagger"
  | "bossDefeated";

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
  // Bends down rather than up: the harder the landing, the deeper the thud.
  land: {
    minGapMs: 140,
    pitchBend: -0.35,
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
  // The shove-off when a web is caught from a rooftop: the same thwip as
  // webAttach with a low thump under it, so a launch reads heavier than a
  // mid-air catch.
  webLaunch: {
    minGapMs: 120,
    layers: [
      {
        source: "noise",
        freq: 2200,
        glide: 700,
        gain: 0.3,
        attack: 0.002,
        release: 0.14,
        q: 2,
      },
      {
        source: "triangle",
        freq: 150,
        glide: 74,
        gain: 0.26,
        attack: 0.004,
        release: 0.2,
      },
    ],
  },
  // One rung per link in a takedown chain: intensity walks it up an octave.
  comboUp: {
    minGapMs: 70,
    pitchBend: 1,
    layers: [
      {
        source: "triangle",
        freq: 660,
        glide: 990,
        gain: 0.15,
        attack: 0.004,
        release: 0.11,
      },
      {
        source: "sine",
        freq: 1320,
        gain: 0.07,
        attack: 0.004,
        release: 0.08,
        delay: 0.03,
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

  // The Weaver. Everything here is pitched below the patrol sounds and given a
  // long tail, so the boss reads as bigger than the enemies it replaces rather
  // than merely louder.
  bossWake: {
    minGapMs: 2000,
    layers: [
      {
        source: "sawtooth",
        freq: 46,
        glide: 92,
        gain: 0.3,
        attack: 0.42,
        hold: 0.3,
        release: 0.9,
        cutoff: 420,
        q: 3,
      },
      {
        source: "noise",
        freq: 300,
        glide: 1500,
        gain: 0.13,
        attack: 0.5,
        release: 0.55,
        q: 0.7,
      },
    ],
  },
  // The legibility beat: the player must not miss that the rules just changed.
  bossPhaseShift: {
    minGapMs: 900,
    layers: [
      {
        source: "square",
        freq: 132,
        glide: 264,
        gain: 0.26,
        attack: 0.006,
        hold: 0.16,
        release: 0.62,
        cutoff: 1500,
        q: 5,
      },
      {
        source: "sawtooth",
        freq: 66,
        gain: 0.22,
        attack: 0.01,
        hold: 0.2,
        release: 0.7,
        cutoff: 700,
      },
      {
        source: "noise",
        freq: 2400,
        glide: 600,
        gain: 0.16,
        attack: 0.004,
        release: 0.5,
        q: 1.2,
      },
    ],
  },
  // Three to five shots leave at once, so one report has to cover the fan.
  bossVolley: {
    minGapMs: 120,
    layers: [
      {
        source: "square",
        freq: 420,
        glide: 150,
        gain: 0.17,
        attack: 0.002,
        release: 0.16,
        cutoff: 2400,
        q: 2,
      },
      {
        source: "noise",
        freq: 1500,
        glide: 500,
        gain: 0.12,
        attack: 0.001,
        release: 0.13,
        q: 1.4,
      },
    ],
  },
  // A body moving fast: low, blunt, and over quickly.
  bossSlam: {
    minGapMs: 300,
    layers: [
      {
        source: "sine",
        freq: 150,
        glide: 42,
        gain: 0.34,
        attack: 0.003,
        release: 0.38,
      },
      {
        source: "noise",
        freq: 700,
        glide: 160,
        gain: 0.2,
        attack: 0.002,
        release: 0.3,
        q: 0.6,
      },
    ],
  },
  // Radial and even, so it rings outward rather than hitting a point.
  bossNova: {
    minGapMs: 400,
    layers: [
      {
        source: "triangle",
        freq: 196,
        glide: 784,
        gain: 0.22,
        attack: 0.008,
        release: 0.72,
        cutoff: 2600,
      },
      {
        source: "sine",
        freq: 392,
        glide: 1568,
        gain: 0.12,
        attack: 0.01,
        release: 0.6,
        delay: 0.04,
      },
    ],
  },
  // A wind-up cut short: pitch collapses instead of resolving.
  bossStagger: {
    minGapMs: 400,
    layers: [
      {
        source: "sawtooth",
        freq: 300,
        glide: 70,
        gain: 0.2,
        attack: 0.004,
        release: 0.42,
        cutoff: 1100,
        q: 4,
      },
      {
        source: "noise",
        freq: 900,
        glide: 240,
        gain: 0.14,
        attack: 0.002,
        release: 0.34,
        q: 1,
      },
    ],
  },
  // The run's payoff. Longest tail of anything in the game.
  bossDefeated: {
    minGapMs: 1500,
    layers: [
      {
        source: "sawtooth",
        freq: 220,
        glide: 55,
        gain: 0.3,
        attack: 0.006,
        hold: 0.18,
        release: 1.4,
        cutoff: 900,
        q: 2,
      },
      {
        source: "triangle",
        freq: 440,
        glide: 110,
        gain: 0.18,
        attack: 0.01,
        release: 1.2,
        delay: 0.08,
      },
      {
        source: "noise",
        freq: 1800,
        glide: 200,
        gain: 0.16,
        attack: 0.01,
        release: 1.1,
        q: 0.7,
      },
    ],
  },
};
