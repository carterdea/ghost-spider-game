import type Phaser from "phaser";
import { artKeys } from "../../game/assets/manifest";

interface AnimationDefinition {
  key: string;
  frames: readonly string[];
  frameRate: number;
  /** Plays the frames out and back, for sweeps that do not loop cleanly. */
  yoyo?: boolean;
}

const DEFINITIONS: readonly AnimationDefinition[] = [
  { key: "player-idle", frames: artKeys.hero.idle, frameRate: 4 },
  { key: "player-run", frames: artKeys.hero.run, frameRate: 9 },
  { key: "player-swing", frames: artKeys.hero.swingCycle, frameRate: 8 },
  { key: "robot-walk", frames: artKeys.robot, frameRate: 5 },
  { key: "gunner-walk", frames: artKeys.enforcer, frameRate: 4 },
  { key: "drone-fly", frames: artKeys.drone, frameRate: 6 },
];

/**
 * Every looping character animation. Rebuilt from scratch on each scene boot:
 * the animation manager is global to the game and outlives a `scene.restart()`.
 */
export const createCharacterAnimations = (scene: Phaser.Scene): void => {
  for (const definition of DEFINITIONS) {
    scene.anims.remove(definition.key);
    scene.anims.create({
      key: definition.key,
      frames: definition.frames.map((key) => ({ key })),
      frameRate: definition.frameRate,
      yoyo: definition.yoyo ?? false,
      repeat: -1,
    });
  }
};
