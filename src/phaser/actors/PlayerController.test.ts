import { describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import type { AnchorPoint } from "../../game/content/levels";
import { type ActionState, createEmptyActions } from "../../game/input/actions";
import { ARCADE_STEP_HZ, PLATFORM_THICKNESS } from "../world/LevelBuilder";
import {
  MAX_TRANSPORT_SPEED,
  PlayerController,
  type PlayerStep,
} from "./PlayerController";
import { BODY_BOXES } from "./placement";

const GROUND_Y = 1450;
const FRAME_MS = 1000 / 60;

interface Contact {
  none: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const noContact = (): Contact => ({
  none: true,
  up: false,
  down: false,
  left: false,
  right: false,
});

/**
 * Stands in for the Arcade sprite. The controller only ever writes a velocity,
 * so the harness plays Arcade's part: integrate that velocity, clamp it to the
 * body's max, and report contact where the body lands.
 */
class SpriteStub {
  public x = 0;
  public y = 0;
  public readonly scaleY = 1;
  public readonly displayOriginY = 96;
  public flipX = false;
  public angle = 0;
  public tinted = true;
  public maxVelocity = Number.POSITIVE_INFINITY;
  public readonly velocity = { x: 0, y: 0 };
  public readonly body = {
    offset: { y: BODY_BOXES.hero.offsetY },
    height: BODY_BOXES.hero.height,
    blocked: noContact(),
    touching: noContact(),
    setAllowGravity: (): unknown => undefined,
    setAllowDrag: (): unknown => undefined,
  };
  public readonly scene = { time: { now: 0 } };

  public setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public setVelocity(x: number, y: number): this {
    this.velocity.x = x;
    this.velocity.y = y;
    return this;
  }

  public setMaxVelocity(value: number): this {
    this.maxVelocity = value;
    return this;
  }

  public setAngle(value: number): this {
    this.angle = value;
    return this;
  }

  public clearTint(): this {
    this.tinted = false;
    return this;
  }
}

const asSprite = (stub: SpriteStub): Phaser.Physics.Arcade.Sprite =>
  stub as unknown as Phaser.Physics.Arcade.Sprite;

/** Distance from the sprite origin down to the sole of its collision box. */
const FEET = BODY_BOXES.hero.offsetY + BODY_BOXES.hero.height - 96;

interface Options {
  actions?: Partial<ActionState>;
  jumpPressed?: boolean;
  anchors?: readonly AnchorPoint[];
  deltaMs?: number;
  /** Off by default so the hero can be dropped into open air. */
  floor?: boolean;
  /** Roof line a static slab presents its surface at, as `LevelBuilder` builds it. */
  roofTop?: number;
}

class Harness {
  public readonly sprite = new SpriteStub();
  public readonly controller: PlayerController;
  /** Furthest the body travels in one Arcade step across the whole run. */
  public maxStepTravel = 0;

  /** `spawn` is a standing position: the hero's feet land on `spawn.y`. */
  public constructor(spawn: { x: number; y: number }) {
    this.controller = new PlayerController(asSprite(this.sprite));
    this.controller.reset(spawn);
  }

  /** One scene frame followed by one Arcade step. */
  public frame(options: Options = {}): PlayerStep {
    const deltaMs = options.deltaMs ?? FRAME_MS;
    const step = this.controller.update(
      { ...createEmptyActions(), ...options.actions },
      options.jumpPressed ?? false,
      options.actions?.web ?? false,
      options.anchors ?? [],
      GROUND_Y,
      deltaMs,
    );

    this.integrate(deltaMs / 1000, options);
    this.sprite.scene.time.now += deltaMs;
    return step;
  }

  public run(count: number, options: Options = {}): void {
    for (let index = 0; index < count; index += 1) {
      this.frame(options);
    }
  }

  private integrate(seconds: number, options: Options): void {
    const clamp = (value: number): number =>
      Math.max(
        -this.sprite.maxVelocity,
        Math.min(this.sprite.maxVelocity, value),
      );

    const velocityX = clamp(this.sprite.velocity.x);
    const velocityY = clamp(this.sprite.velocity.y);
    // Arcade always advances by a fixed step, however long the frame was, so
    // that — not the frame — is the gap between two collision checks.
    this.maxStepTravel = Math.max(
      this.maxStepTravel,
      Math.hypot(velocityX, velocityY) / ARCADE_STEP_HZ,
    );

    this.sprite.x += velocityX * seconds;
    this.sprite.y += velocityY * seconds;

    this.sprite.body.blocked = noContact();
    this.sprite.body.touching = noContact();
    if (options.floor && this.sprite.y + FEET >= GROUND_Y) {
      this.land(GROUND_Y);
    }
    if (options.roofTop !== undefined && velocityY > 0) {
      this.separateRoof(options.roofTop);
    }
  }

  /**
   * A static roof slab, separated the way Arcade does it: the body is advanced
   * a whole step first and only an overlap that is still there afterwards gets
   * resolved. Nothing looks at the path between the two positions, which is why
   * a slab has to be thicker than one step of travel.
   */
  private separateRoof(top: number): void {
    const bottom = this.sprite.y + FEET;
    const overlaps =
      bottom > top &&
      bottom - BODY_BOXES.hero.height < top + PLATFORM_THICKNESS;
    if (overlaps) {
      this.land(top);
    }
  }

  private land(surface: number): void {
    this.sprite.y = surface - FEET;
    this.sprite.body.blocked.down = true;
    this.sprite.body.blocked.none = false;
  }
}

describe("frame timing", () => {
  test("rejects a non-finite delta instead of poisoning the body", () => {
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, 0, -16]) {
      const harness = new Harness({ x: 200, y: GROUND_Y });
      harness.run(4, { floor: true, actions: { moveRight: true } });
      const before = { ...harness.sprite.velocity };
      expect(before.x).toBeGreaterThan(0);

      const step = harness.frame({ deltaMs: delta, floor: true });

      expect(step).toEqual({
        mode: "grounded",
        rope: undefined,
        attached: false,
        released: false,
        jumped: false,
      });
      expect(harness.sprite.velocity).toEqual(before);
    }
  });

  test("keeps Arcade's own velocity guard rather than disabling it", () => {
    const harness = new Harness({ x: 200, y: GROUND_Y });

    expect(harness.sprite.maxVelocity).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(harness.sprite.maxVelocity).toBeGreaterThan(1250);
  });

  test("a stalled frame moves the body by the clamped sim step, not the whole stall", () => {
    const steady = new Harness({ x: 200, y: 600 });
    const stalled = new Harness({ x: 200, y: 600 });

    // Airborne, so the clamped sim step shows up as a real fall.
    steady.frame({ deltaMs: 50 });
    stalled.frame({ deltaMs: 400 });

    // The sim clamps both to 50ms, so the *displacement* must match even though
    // Arcade will integrate the stalled frame for eight times as long.
    expect(stalled.sprite.velocity.y * 0.4).toBeCloseTo(
      steady.sprite.velocity.y * 0.05,
      6,
    );
    expect(stalled.sprite.velocity.y).toBeLessThan(steady.sprite.velocity.y);
  });

  test("never writes a transport velocity Arcade would have to clamp", () => {
    const harness = new Harness({ x: 200, y: 200 });
    const anchors: AnchorPoint[] = [
      { x: 900, y: 220, source: "building" },
      { x: 1500, y: 260, source: "building" },
    ];

    for (let index = 0; index < 400; index += 1) {
      harness.frame({
        actions: { web: true, moveRight: true, reelIn: index > 60 },
        anchors,
        deltaMs: index % 7 === 0 ? 50 : FRAME_MS,
      });
      const speed = Math.hypot(
        harness.sprite.velocity.x,
        harness.sprite.velocity.y,
      );
      expect(speed).toBeLessThanOrEqual(harness.sprite.maxVelocity + 1e-9);
    }
  });
});

describe("ground contact", () => {
  test("walking off a ledge does not buy extra coyote time", () => {
    const harness = new Harness({ x: 200, y: GROUND_Y });
    harness.run(6, { floor: true, actions: { moveRight: true } });

    // Airborne from here on: the floor is gone.
    harness.run(9, { actions: { moveRight: true } });
    const elapsedAirborne = 9 * FRAME_MS;
    expect(elapsedAirborne).toBeGreaterThan(
      1000 * 0.12, // coyoteTime
    );
    expect(elapsedAirborne).toBeLessThan(90 + 1000 * 0.12);

    const step = harness.frame({
      actions: { jump: true, moveRight: true },
      jumpPressed: true,
    });

    expect(step.jumped).toBe(false);
  });

  test("still jumps inside the real coyote window", () => {
    const harness = new Harness({ x: 200, y: GROUND_Y });
    harness.run(6, { floor: true });
    harness.run(3, {});

    const step = harness.frame({ actions: { jump: true }, jumpPressed: true });

    expect(step.jumped).toBe(true);
  });

  test("reports grounded through a brief contact flicker", () => {
    const harness = new Harness({ x: 200, y: GROUND_Y });
    harness.run(4, { floor: true });

    // One frame with no contact at all, as Arcade reports on a non-separating
    // step: the run animation must not blink to airborne.
    expect(harness.frame({}).mode).toBe("grounded");
  });

  test("does not hover: gravity is not held off for the latch window", () => {
    const harness = new Harness({ x: 200, y: GROUND_Y });
    harness.run(6, { floor: true });
    const restingY = harness.sprite.y;

    // 200ms of open air. Pinning the hero to GROUND_STICK for the first 90ms
    // of that — as feeding the latch to the solver did — costs most of the fall.
    harness.run(12, {});

    expect(harness.sprite.y - restingY).toBeGreaterThan(20);
  });

  test("absorbs a sideways shove reported only as touching", () => {
    const harness = new Harness({ x: 200, y: GROUND_Y });
    harness.run(8, { floor: true, actions: { moveRight: true } });
    expect(harness.sprite.velocity.x).toBeGreaterThan(0);

    harness.sprite.body.touching.right = true;
    harness.sprite.body.touching.none = false;
    harness.frame({ floor: true });

    expect(harness.sprite.velocity.x).toBeLessThanOrEqual(0);
  });
});

describe("web attach and release", () => {
  const overhead: AnchorPoint[] = [{ x: 520, y: 900, source: "building" }];

  test("reports the catch once, then holds the line", () => {
    const harness = new Harness({ x: 320, y: 1200 });

    const caught = harness.frame({ actions: { web: true }, anchors: overhead });
    expect(caught.attached).toBe(true);
    expect(caught.released).toBe(false);
    expect(caught.rope).toBeDefined();

    const held = harness.frame({ actions: { web: true }, anchors: overhead });
    expect(held.attached).toBe(false);
    expect(held.rope).toBeDefined();
  });

  test("a ceiling that cuts the line still reports the release", () => {
    const harness = new Harness({ x: 320, y: GROUND_Y });
    harness.run(3, { floor: true });
    // Catching from a standing start lifts the hero, so they are rising.
    harness.frame({ actions: { web: true }, anchors: overhead });

    harness.sprite.body.blocked.up = true;
    harness.sprite.body.blocked.none = false;
    const step = harness.frame({ actions: { web: true }, anchors: overhead });

    expect(step.rope).toBeUndefined();
    expect(step.released).toBe(true);
    expect(step.mode).not.toBe("swinging");
  });

  test("letting go of the key reports the release", () => {
    const harness = new Harness({ x: 320, y: 1200 });
    harness.frame({ actions: { web: true }, anchors: overhead });

    const step = harness.frame({ anchors: overhead });

    expect(step.rope).toBeUndefined();
    expect(step.released).toBe(true);
  });

  test("cutting the line over the top of the arc reports the release", () => {
    const harness = new Harness({ x: 400, y: 300 });
    const anchors: AnchorPoint[] = [];
    for (let x = 400; x <= 4000; x += 200) {
      anchors.push({ x, y: 900, source: "building" });
    }

    // Dive well below the anchor row first, so the reeled-in pendulum carries
    // real speed and can swing clean over the top.
    harness.run(70, { actions: { moveRight: true } });
    expect(harness.sprite.y).toBeGreaterThan(1050);

    let releases = 0;
    let sawRope = false;
    for (let index = 0; index < 200; index += 1) {
      const step = harness.frame({
        actions: { web: true, reelIn: true },
        anchors,
      });
      sawRope = sawRope || step.rope !== undefined;
      if (step.released) {
        releases += 1;
        expect(step.rope).toBeUndefined();
      }
      // The rope may only vanish alongside a release event.
      expect(step.attached && step.rope === undefined).toBe(false);
    }

    expect(sawRope).toBe(true);
    expect(releases).toBeGreaterThan(0);
  });

  test("auto-reel settles on the same length at any frame rate", () => {
    const anchors: AnchorPoint[] = [{ x: 900, y: 900, source: "building" }];
    const settledLength = (deltaMs: number): number => {
      const harness = new Harness({ x: 700, y: GROUND_Y });
      harness.run(3, { floor: true, deltaMs: FRAME_MS });
      // Both rates catch from the identical standing position, so they aim at
      // the identical target length; only the reel steps differ.
      harness.run(16, { actions: { web: true }, anchors, deltaMs });
      const rope = harness.controller.currentRope;
      if (!rope) {
        throw new Error("expected the hero to still be swinging");
      }
      return rope.length;
    };

    // A flat -1 reel overshoots by reelSpeed * dt, up to ~13px at the 50ms clamp.
    expect(settledLength(50)).toBeCloseTo(settledLength(FRAME_MS), 6);
  });

  test("reset forgets the anchor the hero died holding", () => {
    const harness = new Harness({ x: 320, y: 1200 });
    harness.frame({ actions: { web: true }, anchors: overhead });
    expect(harness.controller.releasedAnchor).toBeDefined();

    harness.controller.reset({ x: 200, y: GROUND_Y });

    expect(harness.controller.releasedAnchor).toBeUndefined();
    expect(harness.controller.currentRope).toBeUndefined();
  });
});

/**
 * Arcade does no swept collision for sprites: it advances a body a whole step
 * and only then looks for an overlap. A platform thinner than one step of
 * travel can therefore be crossed without ever being touched. Roofs were 20px
 * against a swing that moves ~21px per step, so the hero could pass through the
 * skyline; `LevelBuilder` now builds every slab thicker than the speed cap.
 */
describe("platform thickness", () => {
  /** A long anchor row high overhead, so a hard swing can run flat out. */
  const skyline = (): AnchorPoint[] => {
    const anchors: AnchorPoint[] = [];
    for (let x = 400; x <= 6000; x += 200) {
      anchors.push({ x, y: 560, source: "building" });
    }
    return anchors;
  };

  /**
   * Dives, catches, then reels in: the fastest the hero ever moves. Returns the
   * lowest point the sole of the collision box reached.
   */
  const swingHard = (harness: Harness, roofTop?: number): number => {
    const anchors = skyline();
    let lowest = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < 260; index += 1) {
      harness.frame({
        actions: { web: true, moveRight: true, reelIn: index > 30 },
        anchors,
        roofTop,
      });
      lowest = Math.max(lowest, harness.sprite.y + FEET);
    }

    return lowest;
  };

  test("a full-speed swing never out-runs a roof slab", () => {
    const harness = new Harness({ x: 200, y: 400 });
    swingHard(harness);

    // The run has to be a real swing, or the budget below proves nothing.
    expect(harness.maxStepTravel * ARCADE_STEP_HZ).toBeGreaterThan(1200);
    expect(harness.maxStepTravel).toBeLessThan(PLATFORM_THICKNESS);
  });

  test("no attainable speed clears a slab in one step, not just this swing", () => {
    // Arcade also clamps the body to `MAX_TRANSPORT_SPEED`, so this is the
    // widest gap between two collision checks the game can ever produce.
    expect(MAX_TRANSPORT_SPEED / ARCADE_STEP_HZ).toBeLessThan(
      PLATFORM_THICKNESS,
    );
  });

  test("a swing driven onto a roof stops on its surface, not below it", () => {
    const roofTop = 1000;
    const harness = new Harness({ x: 200, y: 400 });

    // Exactly the surface: the arc reached the slab and was separated onto it
    // rather than passing through to the far side.
    expect(swingHard(harness, roofTop)).toBe(roofTop);
  });
});
