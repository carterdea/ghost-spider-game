import type { EnemySpawn, LevelDefinition } from "../content/levels";
import type { Rect, Vec2 } from "./physics/vector";

/** The kinds a level file may author into its patrol lanes. */
export type EnemyKind = "robot" | "gunner" | "drone";
/** The finale boss. Spawned by the scene, never authored as a patrol. */
export type BossKind = "boss";
/** Anything that can exist as an enemy at runtime. */
export type ActorKind = EnemyKind | BossKind;
/**
 * The hero's arsenal. Each entry's tuning — charges, recharge, cooldown and the
 * lines it prints — lives in one table in `systems/weapons/arsenal`, so adding a
 * weapon never means adding a branch.
 */
export type GadgetKind =
  | "web-bomb"
  | "impact-web"
  | "web-line"
  | "web-net"
  | "web-shield"
  | "web-wings";

/** Where a run currently stands. Drives the HUD banner and input handling. */
export type RunStatus = "playing" | "cleared" | "knockedOut";

export interface PlayerState {
  health: number;
  maxHealth: number;
  score: number;
  gadget: GadgetKind;
  swinging: boolean;
  shieldUntil: number;
  message: string;
}

export interface EnemyState {
  id: string;
  kind: ActorKind;
  health: number;
  damage: number;
  speed: number;
  patrolMinX: number;
  patrolMaxX: number;
}

/**
 * Everything the finale boss needs. Deliberately not part of `LevelDefinition`:
 * the scene spawns it after the level is built, so level authoring stays a
 * patrol-lane format.
 */
export interface BossSpawn {
  id: string;
  position: Vec2;
  /** The volume the fight happens in. The boss never leaves it. */
  arena: Rect;
  health: number;
  /** Contact damage. Its projectiles use the scene's own bullet damage. */
  damage: number;
  /** Base movement speed in px/s; phases scale it. */
  speed: number;
}

export interface GameState {
  player: PlayerState;
  /** Enemies of the current level only. Rebuilt on every level transition. */
  enemies: EnemyState[];
  progression: {
    levelIndex: number;
    visitedLevelIds: string[];
    status: RunStatus;
  };
}

export const createEnemyState = (spawn: EnemySpawn): EnemyState => ({
  id: spawn.id,
  kind: spawn.kind,
  health: spawn.health,
  damage: spawn.damage,
  speed: spawn.speed,
  patrolMinX: spawn.patrolMinX,
  patrolMaxX: spawn.patrolMaxX,
});

/** The boss carries the same state shape as a patrol, so combat treats it alike. */
export const createBossState = (spawn: BossSpawn): EnemyState => ({
  id: spawn.id,
  kind: "boss",
  health: spawn.health,
  damage: spawn.damage,
  speed: spawn.speed,
  patrolMinX: spawn.arena.x,
  patrolMaxX: spawn.arena.x + spawn.arena.width,
});

export const createInitialGameState = (level: LevelDefinition): GameState => ({
  player: {
    health: 100,
    maxHealth: 100,
    score: 0,
    gadget: "web-bomb",
    swinging: false,
    shieldUntil: 0,
    message: `${level.name}: ${level.subtitle}`,
  },
  enemies: level.enemies.map(createEnemyState),
  progression: {
    levelIndex: 0,
    visitedLevelIds: [level.id],
    status: "playing",
  },
});

/** Swaps in a new level's enemies while carrying score and health forward. */
export const enterLevel = (state: GameState, level: LevelDefinition): void => {
  state.enemies = level.enemies.map(createEnemyState);
  state.player.swinging = false;
  state.player.shieldUntil = 0;
};

export const livingEnemies = (state: GameState): EnemyState[] =>
  state.enemies.filter((enemy) => enemy.health > 0);
