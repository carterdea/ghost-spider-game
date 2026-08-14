import Phaser from "phaser";
import type { ActionKeys, GameAction } from "./actions";

const KEY_CODES: Record<GameAction, readonly number[]> = {
  moveLeft: [Phaser.Input.Keyboard.KeyCodes.A],
  moveRight: [Phaser.Input.Keyboard.KeyCodes.D],
  reelIn: [Phaser.Input.Keyboard.KeyCodes.W],
  reelOut: [Phaser.Input.Keyboard.KeyCodes.S],
  jump: [Phaser.Input.Keyboard.KeyCodes.SPACE],
  web: [Phaser.Input.Keyboard.KeyCodes.E],
  attack: [Phaser.Input.Keyboard.KeyCodes.J],
  gadget: [Phaser.Input.Keyboard.KeyCodes.K],
  cycleGadget: [Phaser.Input.Keyboard.KeyCodes.Q],
  glide: [Phaser.Input.Keyboard.KeyCodes.SHIFT],
  // Space doubles as the start prompt: it is the key a thumb is already on, and
  // the frame that lifts the title swallows the press so it is not also a jump.
  start: [
    Phaser.Input.Keyboard.KeyCodes.SPACE,
    Phaser.Input.Keyboard.KeyCodes.ENTER,
  ],
  pause: [Phaser.Input.Keyboard.KeyCodes.ESC, Phaser.Input.Keyboard.KeyCodes.P],
  reset: [Phaser.Input.Keyboard.KeyCodes.R],
};

export const createKeyboardBindings = (scene: Phaser.Scene): ActionKeys => {
  const keyboard = scene.input.keyboard;

  if (!keyboard) {
    throw new Error("Keyboard input is required for Ghost Spider Swing.");
  }

  const bound = {} as Record<GameAction, readonly Phaser.Input.Keyboard.Key[]>;
  for (const action of Object.keys(KEY_CODES) as GameAction[]) {
    bound[action] = KEY_CODES[action].map((code) => keyboard.addKey(code));
  }
  return bound;
};
