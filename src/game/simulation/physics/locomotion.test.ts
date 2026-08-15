import { describe, expect, test } from "bun:test";
import {
  createLocomotionMemory,
  DEFAULT_LOCOMOTION_TUNING,
  type LocomotionBody,
  type LocomotionInput,
  type LocomotionMemory,
  stepLocomotion,
} from "./locomotion";

const TUNING = DEFAULT_LOCOMOTION_TUNING;
const FRAME = 1 / 60;

const NEUTRAL: LocomotionInput = {
  move: 0,
  jumpHeld: false,
  jumpPressed: false,
  glideHeld: false,
};

const inputOf = (
  overrides: Partial<LocomotionInput> = {},
): LocomotionInput => ({
  ...NEUTRAL,
  ...overrides,
});

const bodyOf = (velocityX = 0, velocityY = 0): LocomotionBody => ({
  position: { x: 0, y: 0 },
  velocity: { x: velocityX, y: velocityY },
});

interface Snapshot {
  body: LocomotionBody;
  memory: LocomotionMemory;
  jumped: boolean;
  /** Smallest y reached, i.e. the highest point of the arc. */
  apexY: number;
  jumpFrames: number[];
}

interface FramePlan {
  grounded: boolean;
  input?: Partial<LocomotionInput>;
}

const startState = (body: LocomotionBody = bodyOf()): Snapshot => ({
  body,
  memory: createLocomotionMemory(),
  jumped: false,
  apexY: body.position.y,
  jumpFrames: [],
});

const run = (
  start: Snapshot,
  frames: number,
  plan: (frame: number, time: number) => FramePlan,
  dt = FRAME,
): Snapshot => {
  let state = start;
  for (let frame = 0; frame < frames; frame += 1) {
    const { grounded, input } = plan(frame, frame * dt);
    const result = stepLocomotion(
      state.body,
      state.memory,
      inputOf(input),
      grounded,
      TUNING,
      dt,
    );
    state = {
      body: result.body,
      memory: result.memory,
      jumped: result.jumped,
      apexY: Math.min(state.apexY, result.body.position.y),
      jumpFrames: result.jumped
        ? [...state.jumpFrames, frame]
        : state.jumpFrames,
    };
  }
  return state;
};

const airborne = (): FramePlan => ({ grounded: false });
const onGround = (): FramePlan => ({ grounded: true });

describe("coyote time", () => {
  const jumpAfterLeavingLedge = (airborneFrames: number): Snapshot => {
    const settled = run(startState(), 3, onGround);
    const falling = run(settled, airborneFrames, airborne);
    return run(falling, 1, () => ({
      grounded: false,
      input: { jumpPressed: true, jumpHeld: true },
    }));
  };

  test("a jump inside the window still launches", () => {
    const result = jumpAfterLeavingLedge(5);

    expect(result.jumped).toBe(true);
    expect(result.body.velocity.y).toBeLessThan(-TUNING.jumpVelocity * 0.9);
  });

  test("a jump after the window is ignored", () => {
    const airborneFrames = Math.ceil((TUNING.coyoteTime / FRAME) * 1.5);
    const result = jumpAfterLeavingLedge(airborneFrames);

    expect(result.jumped).toBe(false);
    expect(result.body.velocity.y).toBeGreaterThan(0);
  });
});

describe("jump buffering", () => {
  const pressThenLand = (airborneFramesAfterPress: number): Snapshot => {
    const pressed = run(startState(bodyOf(0, 200)), 1, () => ({
      grounded: false,
      input: { jumpPressed: true, jumpHeld: true },
    }));
    expect(pressed.jumped).toBe(false);

    const waited = run(pressed, airborneFramesAfterPress, () => ({
      grounded: false,
      input: { jumpHeld: true },
    }));
    return run(waited, 1, () => ({
      grounded: true,
      input: { jumpHeld: true },
    }));
  };

  test("fires on the landing frame when pressed just before touchdown", () => {
    const landing = pressThenLand(4);

    expect(landing.jumped).toBe(true);
    expect(landing.body.velocity.y).toBeLessThan(-TUNING.jumpVelocity * 0.9);
  });

  test("expires when the press was too early", () => {
    const lateFrames = Math.ceil((TUNING.jumpBufferTime / FRAME) * 1.5);
    const landing = pressThenLand(lateFrames);

    expect(landing.jumped).toBe(false);
    expect(landing.body.velocity.y).toBe(0);
  });
});

describe("variable jump height", () => {
  const arcApex = (heldFrames: number): number => {
    const settled = run(startState(), 2, onGround);
    const launched = run(settled, 1, () => ({
      grounded: true,
      input: { jumpPressed: true, jumpHeld: true },
    }));
    const flight = run(launched, 120, (frame) => ({
      grounded: false,
      input: { jumpHeld: frame < heldFrames },
    }));
    return flight.apexY;
  };

  test("releasing early produces a measurably lower apex", () => {
    const fullHold = arcApex(120);
    const tap = arcApex(3);

    expect(fullHold).toBeLessThan(tap);
    expect(tap - fullHold).toBeGreaterThan(30);
  });

  test("holding clears roughly the ballistic height of the impulse", () => {
    const height = -arcApex(120);
    const ballistic = TUNING.jumpVelocity ** 2 / (2 * TUNING.gravity);

    expect(height).toBeGreaterThan(ballistic * 0.95);
    expect(height).toBeLessThan(ballistic * 1.3);
  });
});

describe("gravity shaping", () => {
  const verticalChangeOverOneFrame = (verticalSpeed: number): number => {
    const result = stepLocomotion(
      bodyOf(0, verticalSpeed),
      createLocomotionMemory(),
      NEUTRAL,
      false,
      TUNING,
      FRAME,
    );
    return result.body.velocity.y - verticalSpeed;
  };

  test("vertical speed changes more slowly near the apex than in a fast fall", () => {
    const nearApex = verticalChangeOverOneFrame(0);
    const fastFall = verticalChangeOverOneFrame(900);

    expect(nearApex).toBeGreaterThan(0);
    expect(nearApex).toBeLessThan(fastFall * 0.5);
  });

  test("falling accelerates harder than rising", () => {
    const rising = verticalChangeOverOneFrame(-900);
    const falling = verticalChangeOverOneFrame(900);

    expect(falling).toBeGreaterThan(rising * 1.2);
  });
});

describe("falling limits", () => {
  test("a long fall settles at terminal velocity", () => {
    const fallen = run(startState(), 600, airborne);

    expect(fallen.body.velocity.y).toBeLessThanOrEqual(TUNING.maxFallSpeed);
    expect(fallen.body.velocity.y).toBeGreaterThan(TUNING.maxFallSpeed - 1);
  });

  test("gliding clamps the descent to a slow rate", () => {
    const glided = run(startState(), 600, () => ({
      grounded: false,
      input: { glideHeld: true },
    }));
    const dropped = run(startState(), 600, airborne);

    expect(glided.body.velocity.y).toBeCloseTo(TUNING.glideFallSpeed, 5);
    expect(glided.body.position.y).toBeLessThan(dropped.body.position.y * 0.25);
  });
});

describe("horizontal movement", () => {
  test("running clamps to the maximum run speed", () => {
    const sprint = run(startState(), 120, () => ({
      grounded: true,
      input: { move: 1 },
    }));

    expect(sprint.body.velocity.x).toBeCloseTo(TUNING.maxRunSpeed, 6);
  });

  test("friction brings a neutral body to a full stop", () => {
    const coasting = run(startState(bodyOf(TUNING.maxRunSpeed)), 60, onGround);

    expect(coasting.body.velocity.x).toBe(0);
    expect(coasting.body.position.x).toBeGreaterThan(0);
  });

  test("turning around beats coasting to a stop", () => {
    const start = startState(bodyOf(TUNING.maxRunSpeed));
    const turning = run(start, 6, () => ({
      grounded: true,
      input: { move: -1 },
    }));
    const coasting = run(start, 6, onGround);

    expect(turning.body.velocity.x).toBeLessThan(0);
    expect(coasting.body.velocity.x).toBeGreaterThan(0);
  });

  test("air control is weaker than ground control", () => {
    const plan = (grounded: boolean) => () => ({
      grounded,
      input: { move: 1 },
    });
    const ground = run(startState(), 4, plan(true));
    const air = run(startState(), 4, plan(false));

    expect(air.body.velocity.x).toBeLessThan(ground.body.velocity.x);
    expect(air.body.velocity.x).toBeGreaterThan(0);
  });
});

/**
 * Sub-steps are 1/120s at 60Hz but 1/240s at 240Hz, so any window that is spent
 * before the jump is judged against it is shorter on a slow display. Five
 * milliseconds is the gap between those two sub-steps: enough to catch it.
 */
describe("input windows do not depend on the display", () => {
  const SLIVER = 0.005;

  const jumpedWith = (
    memory: Partial<LocomotionMemory>,
    grounded: boolean,
    input: Partial<LocomotionInput>,
    dt: number,
  ): boolean =>
    stepLocomotion(
      bodyOf(0, 100),
      { ...createLocomotionMemory(), ...memory },
      inputOf(input),
      grounded,
      TUNING,
      dt,
    ).jumped;

  test("the last sliver of coyote time launches at any refresh rate", () => {
    const press = { jumpPressed: true, jumpHeld: true };
    const at = (dt: number): boolean =>
      jumpedWith({ coyoteRemaining: SLIVER }, false, press, dt);

    expect(at(1 / 60)).toBe(true);
    expect(at(1 / 240)).toBe(true);
  });

  test("the last sliver of a buffered press lands at any refresh rate", () => {
    const at = (dt: number): boolean =>
      jumpedWith({ jumpBufferRemaining: SLIVER }, true, { jumpHeld: true }, dt);

    expect(at(1 / 60)).toBe(true);
    expect(at(1 / 240)).toBe(true);
  });
});

describe("frame-rate independence", () => {
  const plan = (_frame: number, time: number): FramePlan => ({
    /** Phase boundaries land on whole frames at both rates. */
    grounded: time < 0.1,
    input: {
      move: 1,
      jumpPressed: time < 1e-6,
      jumpHeld: time < 0.2,
      glideHeld: false,
    },
  });

  test("half a second of flight matches at 30fps and 60fps", () => {
    const fast = run(startState(), 30, plan, 1 / 60);
    const slow = run(startState(), 15, plan, 1 / 30);

    expect(fast.body.position.x).toBeCloseTo(slow.body.position.x, 1);
    expect(fast.body.position.y).toBeCloseTo(slow.body.position.y, 1);
    expect(fast.body.velocity.x).toBeCloseTo(slow.body.velocity.x, 1);
    expect(fast.body.velocity.y).toBeCloseTo(slow.body.velocity.y, 1);
    expect(fast.jumpFrames.length).toBe(slow.jumpFrames.length);
  });
});

describe("purity", () => {
  test("arguments are never mutated", () => {
    const body: LocomotionBody = {
      position: Object.freeze({ x: 10, y: -4 }),
      velocity: Object.freeze({ x: 120, y: -300 }),
    };
    const memory: LocomotionMemory = Object.freeze({
      coyoteRemaining: 0.05,
      jumpBufferRemaining: 0.05,
      isJumping: true,
    });
    const input = Object.freeze(
      inputOf({ move: -1, jumpPressed: true, jumpHeld: true }),
    );
    const frozenBody = Object.freeze(body);

    const result = stepLocomotion(
      frozenBody,
      memory,
      input,
      false,
      TUNING,
      FRAME,
    );

    expect(result.body).not.toBe(frozenBody);
    expect(result.memory).not.toBe(memory);
    expect(frozenBody.position).toEqual({ x: 10, y: -4 });
    expect(frozenBody.velocity).toEqual({ x: 120, y: -300 });
    expect(memory).toEqual({
      coyoteRemaining: 0.05,
      jumpBufferRemaining: 0.05,
      isJumping: true,
    });
    expect(input.jumpPressed).toBe(true);
    expect(result.body.position).not.toEqual(frozenBody.position);
  });

  test("a zero delta leaves the body untouched", () => {
    const result = stepLocomotion(
      bodyOf(50, -10),
      createLocomotionMemory(),
      inputOf({ move: 1 }),
      true,
      TUNING,
      0,
    );

    expect(result.body.velocity).toEqual({ x: 50, y: -10 });
    expect(result.jumped).toBe(false);
  });
});
