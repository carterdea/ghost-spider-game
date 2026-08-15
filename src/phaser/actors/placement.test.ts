import { describe, expect, test } from "bun:test";
import {
  BODY_BOXES,
  feetOffset,
  type PlaceableSprite,
  standOn,
} from "./placement";

/** Every character frame is 192x192 with a centred origin. */
const FRAME_SIZE = 192;

class SpriteStub implements PlaceableSprite {
  public x = 0;
  public y = 0;
  public readonly scaleY: number;
  public readonly displayOriginY = FRAME_SIZE / 2;
  public readonly body: { offset: { y: number }; height: number } | null;

  public constructor(box: { height: number; offsetY: number }, scale: number) {
    this.scaleY = scale;
    // Arcade stores the offset in source pixels but pre-scales the height.
    this.body = { offset: { y: box.offsetY }, height: box.height * scale };
  }

  public setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
}

/** Where Arcade will actually put the bottom of the body. */
const bodyBottom = (sprite: SpriteStub): number => {
  const body = sprite.body;
  if (!body) {
    throw new Error("stub always has a body");
  }
  return (
    sprite.y +
    sprite.scaleY * (body.offset.y - sprite.displayOriginY) +
    body.height
  );
};

describe("feetOffset", () => {
  test("is zero when the sprite has no body", () => {
    const bodiless: PlaceableSprite = {
      scaleY: 1,
      displayOriginY: 96,
      body: null,
      setPosition: () => undefined,
    };

    expect(feetOffset(bodiless)).toBe(0);
  });

  test("measures the unscaled hero from origin to the sole of the box", () => {
    const hero = new SpriteStub(BODY_BOXES.hero, 1);

    expect(feetOffset(hero)).toBe(
      BODY_BOXES.hero.offsetY + BODY_BOXES.hero.height - FRAME_SIZE / 2,
    );
  });

  test("does not double-apply the scale to the already-scaled body height", () => {
    const scale = 0.58;
    const robot = new SpriteStub(BODY_BOXES.robot, scale);

    // The double-scaled reading this replaced was ~43px short.
    expect(feetOffset(robot)).toBeCloseTo(
      (BODY_BOXES.robot.offsetY - FRAME_SIZE / 2) * scale +
        BODY_BOXES.robot.height * scale,
      6,
    );
    expect(feetOffset(robot)).toBeGreaterThan(
      BODY_BOXES.robot.offsetY * scale +
        BODY_BOXES.robot.height * scale * scale -
        (FRAME_SIZE / 2) * scale +
        40,
    );
  });
});

describe("standOn", () => {
  test.each([
    ["hero", BODY_BOXES.hero, 1],
    ["robot", BODY_BOXES.robot, 0.58],
    ["gunner", BODY_BOXES.gunner, 0.65],
  ] as const)("rests the %s's collision box exactly on the ground", (_name, box, scale) => {
    const sprite = new SpriteStub(box, scale);

    standOn(sprite, 400, 1450);

    expect(sprite.x).toBe(400);
    expect(bodyBottom(sprite)).toBeCloseTo(1450, 6);
  });
});
