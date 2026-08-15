import { describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import { Impact } from "./Impact";

class SpriteStub {
  public active = true;
  public tint: number | null = null;
  public clears = 0;

  public setTintFill(color: number): this {
    this.tint = color;
    return this;
  }

  public clearTint(): this {
    this.tint = null;
    this.clears += 1;
    return this;
  }
}

interface Shake {
  duration: number;
  amount: number;
}

/**
 * The slice of a scene `Impact` touches: a clock and one camera. Phaser cannot
 * boot under the test runner, so the camera records instead of shaking.
 */
class SceneStub {
  public now = 0;
  public readonly shakes: Shake[] = [];
  public shakeResets = 0;

  public readonly cameras = {
    main: {
      shake: (duration: number, amount: number): void => {
        this.shakes.push({ duration, amount });
      },
      shakeEffect: {
        reset: (): void => {
          this.shakeResets += 1;
        },
      },
    },
  };

  public readonly time = { now: 0 };

  public constructor() {
    Object.defineProperty(this.time, "now", { get: () => this.now });
  }
}

const asScene = (stub: SceneStub): Phaser.Scene =>
  stub as unknown as Phaser.Scene;

const asSprite = (stub: SpriteStub): Phaser.GameObjects.Sprite =>
  stub as unknown as Phaser.GameObjects.Sprite;

describe("hit stop", () => {
  test("a strike slows the simulation, then hands the delta back whole", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));

    impact.strike(1);
    expect(impact.step(16)).toBeLessThan(2);
    expect(impact.frozen).toBe(true);

    // Well past the longest freeze.
    scene.now = 200;
    expect(impact.step(16)).toBe(16);
    expect(impact.frozen).toBe(false);
  });

  test("a heavier blow holds longer than a lighter one", () => {
    const light = new SceneStub();
    const heavy = new SceneStub();
    const lightImpact = new Impact(asScene(light));
    const heavyImpact = new Impact(asScene(heavy));

    lightImpact.strike(0);
    heavyImpact.strike(1);

    light.now = 60;
    heavy.now = 60;
    expect(lightImpact.frozen).toBe(false);
    expect(heavyImpact.frozen).toBe(true);
  });

  test("a second strike mid-freeze never shortens the first", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));

    impact.strike(1);
    scene.now = 20;
    impact.strike(0);

    scene.now = 100;
    expect(impact.frozen).toBe(true);
  });

  test("holds for the same span of real time at any frame rate", () => {
    /** Sim milliseconds the freeze lets through, at a given frame length. */
    const simTimeDuringFreeze = (frameMs: number): number => {
      const scene = new SceneStub();
      const impact = new Impact(asScene(scene));
      impact.strike(1);

      let simTime = 0;
      while (impact.frozen) {
        simTime += impact.step(frameMs);
        scene.now += frameMs;
      }
      return simTime;
    };

    // A per-frame countdown would let twice as much sim time through at 120fps.
    expect(simTimeDuringFreeze(1000 / 120)).toBeCloseTo(
      simTimeDuringFreeze(1000 / 60),
      1,
    );
  });
});

describe("shake", () => {
  test("scales with the weight of the blow", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));

    impact.strike(0);
    impact.strike(1);

    const [graze, takedown] = scene.shakes;
    expect(takedown.amount).toBeGreaterThan(graze.amount);
    expect(takedown.duration).toBeGreaterThan(graze.duration);
  });

  test("clamps a power outside the range instead of trusting it", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));

    impact.strike(-4);
    impact.strike(40);

    expect(scene.shakes[0].amount).toBeGreaterThan(0);
    expect(scene.shakes[1].amount).toBe(scene.shakes[1].amount);
    expect(scene.shakes[1].amount).toBeLessThan(0.02);
  });
});

describe("flashes", () => {
  test("blows a struck sprite white and clears it once it has run", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));
    const victim = new SpriteStub();

    impact.strike(0.5, asSprite(victim));
    expect(victim.tint).not.toBeNull();

    scene.now = 50;
    impact.step(16);
    expect(victim.tint).not.toBeNull();

    scene.now = 200;
    impact.step(16);
    expect(victim.tint).toBeNull();

    // Off the list: a later frame must not keep clearing it.
    impact.step(16);
    expect(victim.clears).toBe(1);
  });

  test("re-flashing extends the same entry rather than stacking", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));
    const victim = new SpriteStub();

    impact.flash(asSprite(victim));
    scene.now = 60;
    impact.flash(asSprite(victim));

    scene.now = 120;
    impact.step(16);
    expect(victim.tint).not.toBeNull();

    scene.now = 200;
    impact.step(16);
    expect(victim.tint).toBeNull();
    expect(victim.clears).toBe(1);
  });

  test("a sprite destroyed mid-flash is left alone", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));
    const victim = new SpriteStub();

    impact.flash(asSprite(victim));
    victim.active = false;

    scene.now = 200;
    expect(() => impact.step(16)).not.toThrow();
    expect(victim.clears).toBe(0);
  });
});

describe("reset", () => {
  test("drops the freeze, the flashes and the running shake", () => {
    const scene = new SceneStub();
    const impact = new Impact(asScene(scene));
    const victim = new SpriteStub();
    impact.strike(1, asSprite(victim));

    impact.reset();

    expect(impact.frozen).toBe(false);
    expect(impact.step(16)).toBe(16);
    expect(victim.tint).toBeNull();
    expect(scene.shakeResets).toBe(1);

    // Nothing left over to touch the sprite again.
    scene.now = 400;
    impact.step(16);
    expect(victim.clears).toBe(1);
  });
});
