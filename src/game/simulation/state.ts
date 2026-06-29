export type EnemyKind = "robot" | "gunner" | "drone";
export type GadgetKind = "web-net" | "web-shield" | "web-wings";

export interface WebAnchor {
  x: number;
  y: number;
}

export interface PlayerState {
  health: number;
  maxHealth: number;
  score: number;
  gadget: GadgetKind;
  webAttached: boolean;
  webAnchors: WebAnchor[];
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
    webAnchors: [],
    shieldUntil: 0,
    message: "Swing, climb, and clear the skyline.",
  },
  enemies: [
    {
      id: "robot-roof-1",
      kind: "robot",
      health: 48,
      damage: 10,
      patrolMinX: 840,
      patrolMaxX: 1320,
    },
    {
      id: "drone-roof-1",
      kind: "drone",
      health: 28,
      damage: 8,
      patrolMinX: 1180,
      patrolMaxX: 1660,
    },
    {
      id: "gunner-street-1",
      kind: "gunner",
      health: 58,
      damage: 14,
      patrolMinX: 1780,
      patrolMaxX: 2180,
    },
    {
      id: "robot-roof-2",
      kind: "robot",
      health: 48,
      damage: 10,
      patrolMinX: 2680,
      patrolMaxX: 3180,
    },
    {
      id: "drone-roof-2",
      kind: "drone",
      health: 28,
      damage: 8,
      patrolMinX: 3220,
      patrolMaxX: 3740,
    },
    {
      id: "robot-street-1",
      kind: "robot",
      health: 48,
      damage: 11,
      patrolMinX: 3400,
      patrolMaxX: 3820,
    },
    {
      id: "gunner-roof-1",
      kind: "gunner",
      health: 58,
      damage: 14,
      patrolMinX: 4440,
      patrolMaxX: 4920,
    },
    {
      id: "robot-roof-3",
      kind: "robot",
      health: 48,
      damage: 10,
      patrolMinX: 5000,
      patrolMaxX: 5400,
    },
  ],
  world: {
    width: 5600,
    height: 1600,
    streetY: 1450,
  },
});
