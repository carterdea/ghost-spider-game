export type EnemyKind = "robot" | "gunner";
export type GadgetKind = "web-net" | "web-shield" | "web-wings";

export interface PlayerState {
  health: number;
  maxHealth: number;
  score: number;
  gadget: GadgetKind;
  webAttached: boolean;
  webAnchor: { x: number; y: number } | null;
  shieldUntil: number;
  message: string;
}

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  health: number;
  damage: number;
  patrolMinX: number;
  patrolMaxX: number;
}

export interface GameState {
  player: PlayerState;
  enemies: EnemyState[];
  world: {
    width: number;
    height: number;
    streetY: number;
  };
}

export const createInitialGameState = (): GameState => ({
  player: {
    health: 100,
    maxHealth: 100,
    score: 0,
    gadget: "web-net",
    webAttached: false,
    webAnchor: null,
    shieldUntil: 0,
    message: "Swing, climb, and clear the skyline.",
  },
  enemies: [
    { id: "robot-roof-1", kind: "robot", health: 35, damage: 9, patrolMinX: 840, patrolMaxX: 1320 },
    { id: "gunner-street-1", kind: "gunner", health: 45, damage: 14, patrolMinX: 1780, patrolMaxX: 2180 },
    { id: "robot-roof-2", kind: "robot", health: 35, damage: 9, patrolMinX: 2680, patrolMaxX: 3180 },
    { id: "robot-street-1", kind: "robot", health: 35, damage: 10, patrolMinX: 3400, patrolMaxX: 3820 },
    { id: "gunner-roof-1", kind: "gunner", health: 45, damage: 14, patrolMinX: 4440, patrolMaxX: 4920 },
  ],
  world: {
    width: 5600,
    height: 1600,
    streetY: 1450,
  },
});
