import type { Rect, Vec2 } from "../../physics/vector";

/** Escalates as health drops and never rewinds. */
export type BossPhase = 1 | 2 | 3;

export type BossAttackKind = "volley" | "slam" | "nova";

/**
 * `dormant` → `wake` → `stalk` ⇄ (`windup` → `strike` → `recover`), with
 * `shift` cutting in whenever a health threshold falls and `stagger` cutting in
 * whenever a web net lands. Every path back leads to `stalk`.
 */
export type BossAiState =
  | "dormant"
  | "wake"
  | "stalk"
  | "windup"
  | "strike"
  | "recover"
  | "shift"
  | "stagger";

/** One projectile the boss just launched. The caller turns it into a body. */
export interface BossShot {
  origin: Vec2;
  velocity: Vec2;
}

/** What the boss committed to on this frame. */
export type BossAttack =
  | { kind: "volley"; shots: readonly BossShot[] }
  | { kind: "nova"; shots: readonly BossShot[] }
  | { kind: "slam"; direction: Vec2 };

/** One-frame notifications for the presentation layer: sound, camera, HUD. */
export type BossEvent =
  | "wake"
  | "phaseShift"
  | "volley"
  | "slam"
  | "nova"
  | "stagger"
  | "defeated";

/** Everything the boss brain is allowed to know. */
export interface BossPerception {
  position: Vec2;
  player: { position: Vec2; velocity: Vec2 };
  /** The volume the fight happens in. The boss never leaves it. */
  arena: Rect;
  /** Base movement speed in px/s; the phase table scales it. */
  speed: number;
  /** 1 untouched, 0 dead. Drives the phase ladder. */
  healthFraction: number;
  /** Solids that block gunfire. The boss always knows where the player is. */
  blockers: readonly Rect[];
  /** Caught by a web net: cancels a wind-up and staggers the boss. */
  snared: boolean;
}

export interface BossIntent {
  velocityX: number;
  velocityY: number;
  facing: -1 | 1;
  state: BossAiState;
  phase: BossPhase;
  /** 0 → 1 across the wind-up. The overlay reads it. */
  telegraph: number;
  /** Which attack the wind-up belongs to, so each tell can look different. */
  telegraphKind: BossAttackKind | null;
  /** True in the punish window: the boss is planted and harmless. */
  vulnerable: boolean;
  /** Set only on the frame an attack commits. */
  attack: BossAttack | null;
  /** Set only on the frame something worth hearing happened. */
  event: BossEvent | null;
}

/** Mutable timers the caller owns and hands back every frame. */
export interface BossMemory {
  state: BossAiState;
  phase: BossPhase;
  facing: -1 | 1;
  /** Seconds left in the current timed state. */
  timer: number;
  /** Seconds before another attack may begin. */
  cooldown: number;
  /** The attack the current wind-up or strike belongs to. */
  attack: BossAttackKind | null;
  /** Unit direction a committed slam travels along. */
  strikeDirection: Vec2;
  /** Position in the phase's attack rotation, so patterns stay learnable. */
  rotation: number;
  /** Seconds the player has been out of reach. Drives the anti-camp hunt. */
  stale: number;
  /** Seconds of snare immunity left; the boss cannot be chain-netted. */
  snareLock: number;
  /** Advances every frame so the orbit and bob stay smooth. */
  clock: number;
}

export const createBossMemory = (facing: -1 | 1 = -1): BossMemory => ({
  state: "dormant",
  phase: 1,
  facing,
  timer: 0,
  cooldown: 0,
  attack: null,
  strikeDirection: { x: facing, y: 0 },
  rotation: 0,
  stale: 0,
  snareLock: 0,
  clock: 0,
});
