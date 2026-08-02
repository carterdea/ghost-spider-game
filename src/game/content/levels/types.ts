import type { Rect, Vec2 } from "../../simulation/physics/vector";
import type { EnemyKind } from "../../simulation/state";

export type BuildingKind = "tower" | "block" | "lowrise";
export type EnemyLane = "roof" | "street" | "air";
export type AnchorSource = "building" | "authored";

/** A solid, collidable volume. `bounds` is top-left anchored; `bounds.y` is the roof line. */
export interface Building {
  bounds: Rect;
  kind: BuildingKind;
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
  anchors: AnchorPoint[];
  enemies: EnemySpawn[];
}
