export type GameAction =
  | "moveLeft"
  | "moveRight"
  | "reelIn"
  | "reelOut"
  | "jump"
  | "web"
  | "attack"
  | "gadget"
  | "cycleGadget"
  | "glide"
  | "start"
  | "pause"
  | "reset";

export type ActionState = Record<GameAction, boolean>;

/** Anything that knows whether it is held: a Phaser key, or a test's stand-in. */
export interface KeyLike {
  readonly isDown: boolean;
}

/**
 * The keys behind each action. An action can carry several — pause answers to
 * both Escape and P — and any one of them being held is the action being held.
 */
export type ActionKeys = Record<GameAction, readonly KeyLike[]>;

export const createEmptyActions = (): ActionState => ({
  moveLeft: false,
  moveRight: false,
  reelIn: false,
  reelOut: false,
  jump: false,
  web: false,
  attack: false,
  gadget: false,
  cycleGadget: false,
  glide: false,
  start: false,
  pause: false,
  reset: false,
});

export const readActions = (keys: ActionKeys): ActionState => {
  const actions = createEmptyActions();

  for (const action of Object.keys(keys) as GameAction[]) {
    actions[action] = keys[action].some((key) => key.isDown);
  }

  return actions;
};
