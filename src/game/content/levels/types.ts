import type { Rect, Vec2 } from "../../simulation/physics/vector";
import type { EnemyKind } from "../../simulation/state";

export type BuildingKind = "tower" | "block" | "lowrise";
export type EnemyLane = "roof" | "street" | "air";
export type AnchorSource = "building" | "cable" | "authored";

/** A solid, collidable volume. `bounds` is top-left anchored; `bounds.y` is the roof line. */
export interface Building {
  bounds: Rect;
  kind: BuildingKind;
}

/**
 * A line strung between two masts. Anchors are sampled along its sag, so a web
 * thrown at a cable catches the same curve the renderer draws.
 */
export interface Cable {
  from: Vec2;
  to: Vec2;
}

/** A hoist deck, a trolley, or a glass panel — geometry that is not a building. */
export type PlatformKind = "lift" | "trolley" | "ledge";

/** A straight run a platform repeats forever, out and back. */
export interface PlatformMotion {
  /** Travel from the platform's home position, in world pixels. */
  dx: number;
  dy: number;
  /** One leg of the run. */
  travelMs: number;
  /** Rest at each end, so boarding is never a frame-perfect ask. */
  holdMs: number;
}

/** A ledge that gives way on a fixed, telegraphed cycle and comes back. */
export interface PlatformCycle {
  /** Held solid and quiet. */
  solidMs: number;
  /** Still solid, but visibly failing: the tell the player reacts to. */
  warnMs: number;
  /** Gone. Nothing to stand on. */
  goneMs: number;
  /** Offset into the cycle at level start, so a run of ledges alternates. */
  offsetMs: number;
}

/**
 * Standable geometry that is not part of the skyline. Platforms never generate
 * web anchors — a target that moves or vanishes is not something a line can be
 * relied on to catch — so every route stays swingable without them.
 */
export interface Platform {
  /** Top-left anchored; `bounds.y` is the surface an actor stands on. */
  bounds: Rect;
  kind: PlatformKind;
  motion?: PlatformMotion;
  cycle?: PlatformCycle;
}

/** A point a web-line can attach to. Generated anchors always sit on real geometry. */
export interface AnchorPoint {
  x: number;
  y: number;
  source: AnchorSource;
}

export interface EnemySpawn {
  id: string;
  kind: EnemyKind;
  position: Vec2;
  patrolMinX: number;
  patrolMaxX: number;
  lane: EnemyLane;
  health: number;
  damage: number;
  /** Patrol speed in pixels per second. */
  speed: number;
}

/** Touching this circle ends the level. */
export interface LevelGoal {
  x: number;
  y: number;
  radius: number;
}

/** A discrete, self-contained world: own bounds, own spawn, own win condition. */
export interface LevelDefinition {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  backdropKey: string;
  width: number;
  height: number;
  /** Y of the pavement. Buildings stand on it, the street lane runs along it. */
  streetY: number;
  playerSpawn: Vec2;
  goal: LevelGoal;
  buildings: Building[];
  cables: Cable[];
  platforms: Platform[];
  anchors: AnchorPoint[];
  enemies: EnemySpawn[];
}
