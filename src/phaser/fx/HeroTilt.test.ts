import { describe, expect, test } from "bun:test";
import { HeroTilt } from "./HeroTilt";

class TiltStub {
  public angle = 0;

  public setAngle(value: number): this {
    this.angle = value;
    return this;
  }
}

/** Runs `ms` of tilt in frames of `frameMs`. */
const lean = (
  tilt: HeroTilt,
  velocityX: number,
  ms: number,
  frameMs: number,
): void => {
  for (let elapsed = 0; elapsed < ms; elapsed += frameMs) {
    tilt.update("swinging", velocityX, frameMs);
  }
};

describe("HeroTilt", () => {
  test("leans the way the hero travels and mirrors going back", () => {
    const sprite = new TiltStub();
    const tilt = new HeroTilt(sprite);

    lean(tilt, 900, 400, 1000 / 60);
    expect(sprite.angle).toBeGreaterThan(20);

    lean(tilt, -900, 400, 1000 / 60);
    expect(sprite.angle).toBeLessThan(-20);
  });

  test("stands upright on the ground however fast the hero runs", () => {
    const sprite = new TiltStub();
    const tilt = new HeroTilt(sprite);
    lean(tilt, 900, 400, 1000 / 60);

    for (let frame = 0; frame < 40; frame += 1) {
      tilt.update("grounded", 900, 1000 / 60);
    }

    expect(Math.abs(sprite.angle)).toBeLessThan(1);
  });

  test("a swing leans further than a jump at the same speed", () => {
    const swinging = new TiltStub();
    const airborne = new TiltStub();
    const swingTilt = new HeroTilt(swinging);
    const airTilt = new HeroTilt(airborne);

    for (let frame = 0; frame < 40; frame += 1) {
      swingTilt.update("swinging", 900, 1000 / 60);
      airTilt.update("airborne", 900, 1000 / 60);
    }

    expect(swinging.angle).toBeGreaterThan(airborne.angle);
    expect(airborne.angle).toBeGreaterThan(0);
  });

  test("reaches the same lean at any frame rate", () => {
    const sixty = new TiltStub();
    const oneTwenty = new TiltStub();

    lean(new HeroTilt(sixty), 900, 300, 1000 / 60);
    lean(new HeroTilt(oneTwenty), 900, 300, 1000 / 120);

    // A per-frame fraction would leave the 120fps hero twice as far along.
    expect(oneTwenty.angle).toBeCloseTo(sixty.angle, 1);
  });

  test("ignores a dead frame rather than writing a NaN angle", () => {
    const sprite = new TiltStub();
    const tilt = new HeroTilt(sprite);

    for (const delta of [Number.NaN, 0, -16]) {
      tilt.update("swinging", 900, delta);
    }

    expect(sprite.angle).toBe(0);
    expect(tilt.currentAngle).toBe(0);
  });

  test("reset puts the hero back upright", () => {
    const sprite = new TiltStub();
    const tilt = new HeroTilt(sprite);
    lean(tilt, 900, 400, 1000 / 60);

    tilt.reset();

    expect(sprite.angle).toBe(0);
    expect(tilt.currentAngle).toBe(0);
  });
});
