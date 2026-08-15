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

/** The slice of a sprite `fitWidth` needs. */
export interface SizedSprite {
  readonly width: number;
  setScale(value: number): unknown;
}

/**
 * Scales a sprite so it draws `width` pixels wide, and returns the scale used.
 *
 * Every weapon sprite goes through this, so the size a weapon reads at on
 * screen is stated once in the code that fires it rather than baked into the
 * texture. Swapping a 36px placeholder for a 192px raster frame then changes
 * nothing but the texture key.
 */
export const fitWidth = (sprite: SizedSprite, width: number): number => {
  const scale = sprite.width > 0 ? width / sprite.width : 1;
  sprite.setScale(scale);
  return scale;
};

/**
 * The slice of a Phaser sprite placement reads. Narrow on purpose: it is what
 * makes the offset maths below unit-testable without booting the engine.
 */
export interface PlaceableSprite {
  readonly scaleY: number;
  readonly displayOriginY: number;
  readonly body: {
    readonly offset: { readonly y: number };
    readonly height: number;
  } | null;
  setPosition(x: number, y: number): unknown;
}

/**
 * Distance from the sprite's origin down to the bottom of its collision box.
 * Lets level data express spawns as ground positions rather than sprite centres.
 *
 * Arcade places the body at `sprite.y + scaleY * (offset.y - displayOriginY)`
 * and keeps `body.height` *already scaled* (`sourceHeight * scaleY`). Only the
 * source-space terms may take the scale — scaling the height again shrank every
 * scaled actor's feet offset, which sank the enemies into the pavement.
 */
export const feetOffset = (sprite: PlaceableSprite): number => {
  const body = sprite.body;
  if (!body) {
    return 0;
  }
  return (body.offset.y - sprite.displayOriginY) * sprite.scaleY + body.height;
};

/** Places a sprite so the bottom of its collision box rests on `groundY`. */
export const standOn = (
  sprite: PlaceableSprite,
  x: number,
  groundY: number,
): void => {
  sprite.setPosition(x, groundY - feetOffset(sprite));
};
