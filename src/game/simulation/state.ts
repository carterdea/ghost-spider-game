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

/**
 * Where a run currently stands. Drives the HUD banner and input handling.
 *
 * Only `playing` simulates. The other four are all held worlds — the title
 * before the first swing, a pause, and the two ways a run ends — which is why
 * pausing is a status rather than a flag on the scene: one thing decides
 * whether the world moves, and everything else reads it.
 */
export type RunStatus =
  | "title"
  | "playing"
  | "paused"
  | "cleared"
  | "knockedOut";

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

export interface RunProgression {
  levelIndex: number;
  visitedLevelIds: string[];
  status: RunStatus;
  /** Goals touched this run, the final one included. */
  districtsCleared: number;
  /** Longest takedown chain the run managed. Survives the chain that set it. */
  bestChain: number;
  /** Real milliseconds spent in play. Title and pause time do not count. */
  elapsedMs: number;
}

export interface GameState {
  player: PlayerState;
  /** Enemies of the current level only. Rebuilt on every level transition. */
  enemies: EnemyState[];
  progression: RunProgression;
}

/** What the end-of-run panel reads. Derived, so nothing has to remember it. */
export interface RunSummary {
  score: number;
  districtsCleared: number;
  bestChain: number;
  elapsedMs: number;
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

/**
 * `status` is where the run starts. The scene boots into `"title"`; everything
 * that only wants a world to reason about — tests, tools — takes the default.
 */
export const createInitialGameState = (
  level: LevelDefinition,
  status: RunStatus = "playing",
): GameState => ({
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
    status,
    districtsCleared: 0,
    bestChain: 0,
    elapsedMs: 0,
  },
});

/**
 * The start prompt. Only a run still sitting on the title can begin, so a key
 * held down through the first frames of play cannot start it twice. Returns
 * whether the run actually started.
 */
export const startRun = (state: GameState): boolean => {
  if (state.progression.status !== "title") {
    return false;
  }
  state.progression.status = "playing";
  return true;
};

/**
 * Escape or P. Only a run in play can be held and only a held one resumed: a
 * title, a cleared skyline and a knocked-out hero have no world to freeze, and
 * pausing one would strand the run in a status it could never leave.
 * Returns the status the toggle settled on, unchanged when it did nothing.
 */
export const togglePause = (state: GameState): RunStatus => {
  const { progression } = state;
  if (progression.status === "playing") {
    progression.status = "paused";
  } else if (progression.status === "paused") {
    progression.status = "playing";
  }
  return progression.status;
};

export const runSummary = (state: GameState): RunSummary => ({
  score: state.player.score,
  districtsCleared: state.progression.districtsCleared,
  bestChain: state.progression.bestChain,
  elapsedMs: state.progression.elapsedMs,
});

/** Swaps in a new level's enemies while carrying score and health forward. */
export const enterLevel = (state: GameState, level: LevelDefinition): void => {
  state.enemies = level.enemies.map(createEnemyState);
  state.player.swinging = false;
  state.player.shieldUntil = 0;
};

export const livingEnemies = (state: GameState): EnemyState[] =>
  state.enemies.filter((enemy) => enemy.health > 0);
