export type GameAction =
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "web"
  | "attack"
  | "drop"
  | "reset";

export type ActionState = Record<GameAction, boolean>;

export const createEmptyActions = (): ActionState => ({
  moveLeft: false,
  moveRight: false,
  jump: false,
  web: false,
  attack: false,
  drop: false,
  reset: false,
});
