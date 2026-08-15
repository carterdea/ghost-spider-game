import type { BossAttackKind, BossPhase } from "./types";

/** What changes from phase to phase. Times are seconds, distances pixels. */
export interface BossPhaseTuning {
  /** Attack rotation, cycled in order so the pattern is learnable. */
  rotation: readonly BossAttackKind[];
  /** Visible wind-up before any of this phase's attacks commit. */
  windupTime: number;
  /** Seconds of breathing room after the punish window closes. */
  cooldown: number;
  /** Scales every attack's punish window. Later phases give less of it. */
  recoverFactor: number;
  /** Multiplies the authored base speed while stalking. */
  speedFactor: number;
  /** Distance the boss tries to hold from the player. */
  standoff: number;
  /** How far above the player it likes to sit. */
  orbitHeight: number;
  volleyShots: number;
  /** Total spread of the volley fan, in radians. */
  volleySpread: number;
  slamSpeed: number;
}

export interface BossTuning {
  phases: Readonly<Record<BossPhase, BossPhaseTuning>>;
  /** Health fractions at or below which phases 2 and 3 begin. */
  phaseThresholds: readonly [number, number];
  /** The player this close — or any damage at all — wakes the boss. */
  wakeRadius: number;
  wakeTime: number;
  /** The planted beat that sells a phase change. */
  shiftTime: number;
  /** A netted boss loses its wind-up and hangs for this long. */
  staggerTime: number;
  /** Seconds of snare immunity after a stagger. Nets cannot chain-lock it. */
  snareLockTime: number;
  /** Climb rate used by the wake, the phase shift, and the slam wind-up. */
  riseSpeed: number;
  /**
   * How close the hull settles beside the hero while it is open. Inside the
   * hero's own 96px swing, or the punish window pays nothing.
   */
  openReach: number;
  /** Where it settles against the hero's height. Negative sits above them. */
  openLift: number;
  /** How fast it sinks into the punish window. */
  openSpeed: number;
  bulletSpeed: number;
  novaShots: number;
  novaBulletSpeed: number;
  /** Fraction of the predicted lead actually used. Under-leading keeps it fair. */
  leadFactor: number;
  /** Cap on how far ahead aim predicts, in seconds. */
  maxLeadTime: number;
  /** Multiple of the stand-off still counted as "in reach". */
  reachFactor: number;
  /** Seconds out of reach before the boss abandons its stand-off and hunts. */
  patience: number;
  huntSpeedFactor: number;
  /** How close a hunting boss crowds the player. Tighter than any stand-off. */
  huntStandoff: number;
  /** How far above the player a hunting boss sits. */
  huntLift: number;
  /** Radians per second the stalk sweep advances. */
  strafeRate: number;
  bobAmplitude: number;
  bobRate: number;
  /** Keeps the boss this far inside the arena walls. */
  margin: number;
}

/**
 * The shape of each attack, in seconds. The wind-up length belongs to the
 * phase — that is the number the player learns — while the strike and the
 * punish window belong to the attack, so each one reads differently.
 */
export const BOSS_ATTACK_SHAPE: Readonly<
  Record<BossAttackKind, { strike: number; recover: number }>
> = {
  volley: { strike: 0.12, recover: 0.72 },
  slam: { strike: 0.42, recover: 1 },
  nova: { strike: 0.14, recover: 1.1 },
};

/**
 * Tuned against a hero who runs at 430px/s and swings up to 1600. The boss
 * cannot win a foot race, so its pressure comes from covering space with
 * bullets and from closing 1000px in under half a second when it slams.
 *
 * The bullet numbers are deliberately thinner than they read: a hero holding
 * 100 health against fifteen a second has under seven seconds of standing in
 * the wrong place, and the fight needs thirty. Fewer shots in a fan, slower,
 * and under-led further, so the answer to a volley stays "move" rather than
 * "have more health than it".
 */
export const BOSS_TUNING: BossTuning = {
  phaseThresholds: [0.66, 0.33],
  wakeRadius: 620,
  wakeTime: 0.9,
  shiftTime: 1.1,
  staggerTime: 0.85,
  snareLockTime: 3.6,
  riseSpeed: 190,
  openReach: 60,
  openLift: -20,
  openSpeed: 520,
  bulletSpeed: 390,
  novaShots: 10,
  novaBulletSpeed: 320,
  leadFactor: 0.4,
  maxLeadTime: 0.7,
  reachFactor: 1.5,
  patience: 2.4,
  huntSpeedFactor: 2.3,
  huntStandoff: 210,
  huntLift: 90,
  strafeRate: 0.9,
  bobAmplitude: 60,
  bobRate: 1.7,
  margin: 90,
  phases: {
    // One attack, a long tell, and a wide punish window: the phase that
    // teaches the rhythm.
    1: {
      rotation: ["volley"],
      windupTime: 0.78,
      cooldown: 1.5,
      recoverFactor: 1,
      speedFactor: 1,
      standoff: 430,
      orbitHeight: 150,
      volleyShots: 2,
      volleySpread: 0.42,
      slamSpeed: 900,
    },
    // The slam arrives: the arena stops being a shooting gallery and the
    // player has to break their line rather than just sidestep it.
    2: {
      rotation: ["volley", "slam"],
      windupTime: 0.58,
      cooldown: 1,
      recoverFactor: 0.88,
      speedFactor: 1.45,
      standoff: 330,
      orbitHeight: 120,
      volleyShots: 3,
      volleySpread: 0.52,
      slamSpeed: 940,
    },
    // Nova closes off standing still anywhere, and the tells are short enough
    // that the player has to already be moving when they read them.
    3: {
      rotation: ["slam", "volley", "nova"],
      windupTime: 0.42,
      cooldown: 0.7,
      recoverFactor: 0.76,
      speedFactor: 1.9,
      standoff: 250,
      orbitHeight: 90,
      volleyShots: 4,
      volleySpread: 0.64,
      slamSpeed: 1060,
    },
  },
};

/** The phase a health fraction calls for. The brain only ever climbs. */
export const phaseFor = (fraction: number, tuning: BossTuning): BossPhase => {
  const [second, third] = tuning.phaseThresholds;
  if (fraction <= third) {
    return 3;
  }
  return fraction <= second ? 2 : 1;
};

/** Default authored move speed. Phase factors take it from 260 to 494px/s. */
export const BOSS_BASE_SPEED = 260;
