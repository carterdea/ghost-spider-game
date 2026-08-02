import type { EnemySpawn, LevelDefinition } from "../content/levels";

export type EnemyKind = "robot" | "gunner" | "drone";
export type GadgetKind = "web-net" | "web-shield" | "web-wings";

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
  kind: EnemyKind;
  health: number;
  damage: number;
  speed: number;
  patrolMinX: number;
  patrolMaxX: number;
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

export const createInitialGameState = (level: LevelDefinition): GameState => ({
  player: {
    health: 100,
    maxHealth: 100,
    score: 0,
    gadget: "web-net",
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
