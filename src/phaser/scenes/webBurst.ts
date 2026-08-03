import type Phaser from "phaser";
import type { LevelWorld } from "../world/LevelWorld";

/** A spun web, drawn once and faded out: the flourish every gadget leaves. */

const SPOKES = 10;
const WEB_COLOR = 0xeef8ff;
/** The inner ring sits this far in, so the web reads as a web and not a hoop. */
const INNER_RING = 0.55;

/**
 * Tracked by the level rather than the scene: a gadget fired on the last frame
 * before a transition would otherwise leave its graphic and its tween behind.
 */
export const spawnWebBurst = (
  scene: Phaser.Scene,
  world: LevelWorld,
  x: number,
  y: number,
  radius: number,
  duration: number,
): void => {
  const burst = world.track(scene.add.graphics().setDepth(9));
  burst.lineStyle(2, WEB_COLOR, 0.82);
  burst.strokeCircle(x, y, radius);
  burst.strokeCircle(x, y, radius * INNER_RING);
  for (let spoke = 0; spoke < SPOKES; spoke += 1) {
    const angle = (Math.PI * 2 * spoke) / SPOKES;
    burst.lineBetween(
      x,
      y,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
    );
  }

  const tween: Phaser.Tweens.Tween = world.tween({
    targets: burst,
    alpha: 0,
    scale: 1.18,
    duration,
    ease: "Sine.out",
    onComplete: () => world.discard(burst, tween),
  });
};
