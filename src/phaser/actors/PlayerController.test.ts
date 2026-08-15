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
 *
 * The body is modelled as Arcade really keeps it — a position of its own that
 * the sprite catches up with by the *delta* since `prev`, in POST_UPDATE, after
 * the scene's own update has run. Anything that moves the sprite from inside
 * that update has to sync the body or the frame's leftover travel is added on
 * top of wherever it was put.
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
    position: { x: 0, y: 0 },
    prev: { x: 0, y: 0 },
    setAllowGravity: (): unknown => undefined,
    setAllowDrag: (): unknown => undefined,
    /** Arcade's own: move the body, stop it, and forget the step delta. */
    reset: (x: number, y: number): void => {
      this.setPosition(x, y);
      this.setVelocity(0, 0);
      this.syncBody();
    },
  };
  public readonly scene = { time: { now: 0 } };

  public setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /** One Arcade step: the body moves now, the sprite in POST_UPDATE. */
  public advance(dx: number, dy: number): void {
    this.body.position.x += dx;
    this.body.position.y += dy;
  }

  /** POST_UPDATE: the sprite is carried by however far the body has gone. */
  public postUpdate(): void {
    this.x += this.body.position.x - this.body.prev.x;
    this.y += this.body.position.y - this.body.prev.y;
    this.body.prev = { ...this.body.position };
  }

  /** Puts the body where the sprite is, with no travel outstanding. */
  public syncBody(): void {
    this.body.position = { x: this.x, y: this.y };
    this.body.prev = { x: this.x, y: this.y };
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
  /** Right-hand edge of that slab. Unbounded when left out. */
  roofRight?: number;
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

    this.sprite.advance(velocityX * seconds, velocityY * seconds);
    this.sprite.postUpdate();

    this.sprite.body.blocked = noContact();
    this.sprite.body.touching = noContact();
    if (options.floor && this.sprite.y + FEET >= GROUND_Y) {
      this.land(GROUND_Y);
    }
    if (
      options.roofTop !== undefined &&
      velocityY > 0 &&
      this.sprite.x <= (options.roofRight ?? Number.POSITIVE_INFINITY)
    ) {
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

  /** Separation moves the body as well as the sprite, so nothing is pending. */
  private land(surface: number): void {
    this.sprite.y = surface - FEET;
    this.sprite.syncBody();
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
        landingImpact: 0,
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

  /** Drops the hero onto the harness floor and reports the landing's weight. */
  const dropFrom = (height: number): number => {
    const harness = new Harness({ x: 200, y: GROUND_Y - height });
    for (let frame = 0; frame < 90; frame += 1) {
      const impact = harness.frame({ floor: true }).landingImpact;
      if (impact > 0) {
        // Standing still afterwards is not a landing every frame.
        for (let resting = 0; resting < 5; resting += 1) {
          expect(harness.frame({ floor: true }).landingImpact).toBe(0);
        }
        return impact;
      }
    }
    throw new Error("the hero never reached the floor");
  };

  test("reports the weight of a landing, once, and nothing while resting", () => {
    expect(dropFrom(400)).toBeGreaterThan(300);
  });

  test("a gentle arrival weighs less than a long drop", () => {
    const soft = dropFrom(60);
    expect(soft).toBeGreaterThan(0);
    expect(dropFrom(900)).toBeGreaterThan(soft);
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

describe("respawning between levels", () => {
  /**
   * A level transition respawns the hero from inside the scene's update, which
   * Arcade has already stepped the world for. The body's travel for that frame
   * is written onto the sprite afterwards, as a delta, so a reset that only
   * moved the transform was displaced by whatever the hero had been doing —
   * ~21px at the swing cap, up to 40 at `MAX_TRANSPORT_SPEED`, through a roof
   * they are only dropped 60px above.
   */
  test("a respawn is not displaced by the frame's leftover body travel", () => {
    const harness = new Harness({ x: 200, y: 600 });
    // Falling hard, and mid-frame: the body has moved, the sprite has not.
    harness.run(30, {});
    const pending = harness.sprite.velocity.y * (FRAME_MS / 1000);
    // A terminal-velocity fall alone is most of a hero's height off the spawn.
    expect(pending).toBeGreaterThan(15);
    harness.sprite.advance(0, pending);

    const spawn = { x: 900, y: 1080 };
    harness.controller.reset(spawn);
    harness.sprite.postUpdate();

    expect(harness.sprite.x).toBe(spawn.x);
    expect(harness.sprite.y).toBe(spawn.y - FEET);
  });
});

/**
 * A pendulum bottoms out at `anchor.y + length`. Solved against the pavement,
 * a rooftop catch happily picks an arc that dips hundreds of pixels *through*
 * the roof, and the hero spends a second being dragged along it under a rope
 * that never lifts. The catch has to clear the floor the hero is actually on.
 */
describe("launching off a roof", () => {
  /** Level one's opening, to scale: a low roof and one anchor across the gap. */
  const ROOF_TOP = 1080;
  const ROOF_RIGHT = 560;
  const SPAWN = { x: 340, y: ROOF_TOP - 60 };
  const acrossTheGap: AnchorPoint[] = [{ x: 800, y: 768, source: "building" }];

  /** Holds the web from spawn and reports every frame spent touching the roof. */
  const draggedFrames = (frames: number): number => {
    const harness = new Harness(SPAWN);
    let dragged = 0;

    for (let index = 0; index < frames; index += 1) {
      const step = harness.frame({
        actions: { web: true },
        anchors: acrossTheGap,
        roofTop: ROOF_TOP,
        roofRight: ROOF_RIGHT,
      });
      if (step.rope && harness.sprite.body.blocked.down) {
        dragged += 1;
      }
    }

    return dragged;
  };

  test("a web caught at spawn lifts off instead of scraping the roof", () => {
    // 45 frames is three quarters of a second: the whole of the old drag.
    expect(draggedFrames(45)).toBe(0);
  });

  test("the launch clears the roof edge rather than stopping short of it", () => {
    const harness = new Harness(SPAWN);
    harness.run(45, {
      actions: { web: true },
      anchors: acrossTheGap,
      roofTop: ROOF_TOP,
      roofRight: ROOF_RIGHT,
    });

    expect(harness.sprite.x).toBeGreaterThan(ROOF_RIGHT);
  });

  test("a catch in open air takes no launch kick", () => {
    const harness = new Harness({ x: 200, y: 200 });
    // Far below the anchor row and far above any floor: an ordinary mid-air
    // catch, which is the common case and must be left exactly as it was.
    harness.run(20, { actions: { moveRight: true } });
    const before = Math.hypot(
      harness.sprite.velocity.x,
      harness.sprite.velocity.y,
    );

    const caught = harness.frame({
      actions: { web: true, moveRight: true },
      anchors: [{ x: 700, y: 120, source: "building" }],
    });
    const after = Math.hypot(
      harness.sprite.velocity.x,
      harness.sprite.velocity.y,
    );

    expect(caught.rope).toBeDefined();
    // Gravity over one frame is the only change a plain catch may make.
    expect(Math.abs(after - before)).toBeLessThan(60);
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
