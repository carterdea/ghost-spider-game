import Phaser from "phaser";
import { createEmptyActions, type ActionState } from "./actions";

type KeyMap = Record<keyof ActionState, Phaser.Input.Keyboard.Key>;

export const createKeyboardBindings = (scene: Phaser.Scene): KeyMap => {
  const keyboard = scene.input.keyboard;

  if (!keyboard) {
    throw new Error("Keyboard input is required for Ghost Spider Swing.");
  }

  return {
    moveLeft: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    moveRight: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    jump: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    web: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    attack: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
    drop: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    reset: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
  };
};

export const readActions = (keys: KeyMap): ActionState => {
  const actions = createEmptyActions();

  for (const action of Object.keys(keys) as Array<keyof ActionState>) {
    actions[action] = keys[action].isDown;
  }

  return actions;
};
