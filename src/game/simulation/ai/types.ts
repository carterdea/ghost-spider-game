import type { Rect, Vec2 } from "../physics/vector";

/**
 * Patrol until the player is spotted, hesitate long enough for the player to
 * react, commit, then walk it back. Every kind shares the shape; only the
 * `engage` behaviour differs.
 */
export type EnemyAiState = "patrol" | "alert" | "engage" | "recover";

/** What the enemy committed to this frame. Presentation reads it for fx and sound. */
export type EnemyAttack =
  | { kind: "lunge" }
  | { kind: "dive" }
  | { kind: "shot"; origin: Vec2; velocity: Vec2 };

/** Everything the brain is allowed to know. Gathered by the presentation layer. */
export interface AiPerception {
  position: Vec2;
  player: { position: Vec2; velocity: Vec2 };
  patrol: { minX: number; maxX: number };
  /** Authored patrol speed in px/s; the tuning table scales it per state. */
  speed: number;
  /** Air-lane enemies hover instead of falling and bob around `homeY`. */
  airborne: boolean;
  homeY: number;
  /** Solid volumes that block sight and gunfire. */
  blockers: readonly Rect[];
  /** Held by a web snare: the brain idles without forgetting the player. */
  snared: boolean;
}

export interface AiIntent {
  velocityX: number;
  /** `null` leaves the vertical axis to gravity; a number is applied directly. */
  velocityY: number | null;
  facing: -1 | 1;
  state: EnemyAiState;
  /** 0 idle, ramping to 1 as a strike winds up. Drives the telegraph the player reads. */
  telegraph: number;
  /** Set only on the frame an attack commits. */
  attack: EnemyAttack | null;
  /** Set only on the frame the enemy first spots the player. */
  alerted: boolean;
}

/** Mutable per-enemy timers the caller owns and passes back each frame. */
export interface AiMemory {
  state: EnemyAiState;
  facing: -1 | 1;
  patrolDirection: -1 | 1;
  /** Seconds left before a freshly alerted enemy may act. */
  reaction: number;
  /** Seconds left of the visible wind-up before a strike lands. */
  windup: number;
  /** Seconds left of the committed strike's travel. */
  strike: number;
  /** Unit direction the committed strike travels along. */
  strikeDirection: Vec2;
  /** Seconds left before another strike is allowed. */
  cooldown: number;
  /** Seconds the player has been out of sight. */
  blind: number;
  /** Seconds left walking home before patrolling again. */
  recovery: number;
  /** Shots still owed by the current burst. */
  shotsLeft: number;
  /** Seconds until the next shot of a burst. */
  shotDelay: number;
  /** Where the player was last seen, for search behaviour. */
  lastSeen: Vec2 | null;
  /** Advances every frame so strafing and bobbing never sync across enemies. */
  phase: number;
}

export const createAiMemory = (facing: -1 | 1 = 1, phase = 0): AiMemory => ({
  state: "patrol",
  facing,
  patrolDirection: facing,
  reaction: 0,
  windup: 0,
  strike: 0,
  strikeDirection: { x: facing, y: 0 },
  cooldown: 0,
  blind: 0,
  recovery: 0,
  shotsLeft: 0,
  shotDelay: 0,
  lastSeen: null,
  phase,
});
