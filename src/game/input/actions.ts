export type GameAction =
  | "moveLeft"
  | "moveRight"
  | "moveUp"
  | "moveDown"
  | "jump"
  | "web"
  | "attack"
  | "gadget"
  | "cycleGadget"
  | "glide"
  | "reset";

export type ActionState = Record<GameAction, boolean>;

export const createEmptyActions = (): ActionState => ({
  moveLeft: false,
  moveRight: false,
  moveUp: false,
  moveDown: false,
  jump: false,
  web: false,
  attack: false,
  gadget: false,
  cycleGadget: false,
  glide: false,
  reset: false,
});
