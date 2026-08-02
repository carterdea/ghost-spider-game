import type Phaser from "phaser";

/**
 * Collision boxes measured from the opaque bounds of the raster art (every
 * character frame is 192x192 with the feet on the bottom edge). The scene used
 * to carry boxes sized for the old 96x136 generated sprites, which left the
 * hero's box straddling the roof line and falling straight through it.
 */
export const BODY_BOXES = {
  hero: { width: 52, height: 132, offsetX: 70, offsetY: 60 },
  robot: { width: 104, height: 176, offsetX: 44, offsetY: 16 },
  gunner: { width: 74, height: 184, offsetX: 59, offsetY: 8 },
  drone: { width: 150, height: 58, offsetX: 21, offsetY: 132 },
} as const;

export interface BodyBox {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export const applyBodyBox = (
  sprite: Phaser.Physics.Arcade.Sprite,
  box: BodyBox,
): void => {
  sprite.body
    ?.setSize(box.width, box.height)
    .setOffset(box.offsetX, box.offsetY);
};

/**
 * Distance from the sprite's origin down to the bottom of its collision box.
 * Lets level data express spawns as ground positions rather than sprite centres.
 */
export const feetOffset = (sprite: Phaser.Physics.Arcade.Sprite): number => {
  const body = sprite.body;
  if (!body) {
    return 0;
  }
  return (
    body.offset.y * sprite.scaleY +
    body.height * sprite.scaleY -
    sprite.originY * sprite.frame.height * sprite.scaleY
  );
};

/** Places a sprite so the bottom of its collision box rests on `groundY`. */
export const standOn = (
  sprite: Phaser.Physics.Arcade.Sprite,
  x: number,
  groundY: number,
): void => {
  sprite.setPosition(x, groundY - feetOffset(sprite));
};
