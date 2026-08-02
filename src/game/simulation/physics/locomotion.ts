import { clamp, type Vec2 } from "./vector";

export interface LocomotionBody {
  position: Vec2;
  velocity: Vec2;
}

export interface LocomotionInput {
  /** -1 left, +1 right, 0 neutral. */
  move: number;
  jumpHeld: boolean;
  /** True only on the frame the jump key went down. */
  jumpPressed: boolean;
  glideHeld: boolean;
}

/** Mutable per-entity timers the caller owns and passes back each frame. */
export interface LocomotionMemory {
  coyoteRemaining: number;
  jumpBufferRemaining: number;
  isJumping: boolean;
}

export const createLocomotionMemory = (): LocomotionMemory => ({
  coyoteRemaining: 0,
  jumpBufferRemaining: 0,
  isJumping: false,
});

export interface LocomotionTuning {
  gravity: number;
  fallGravityMultiplier: number;
  apexGravityMultiplier: number;
  apexThreshold: number;
  jumpVelocity: number;
  jumpCutMultiplier: number;
  coyoteTime: number;
  jumpBufferTime: number;
  groundAcceleration: number;
  airAcceleration: number;
  turnAroundMultiplier: number;
  groundFriction: number;
  airFriction: number;
  maxRunSpeed: number;
  maxFallSpeed: number;
  glideFallSpeed: number;
  fixedStep: number;
}

/** Pixels-per-second world, y pointing down, matching the Phaser scene. */
export const DEFAULT_LOCOMOTION_TUNING: LocomotionTuning = {
  gravity: 2000,
  fallGravityMultiplier: 1.55,
  apexGravityMultiplier: 0.55,
  apexThreshold: 120,
  jumpVelocity: 620,
  jumpCutMultiplier: 0.45,
  coyoteTime: 0.12,
  jumpBufferTime: 0.15,
  groundAcceleration: 3200,
  airAcceleration: 2000,
  turnAroundMultiplier: 2.2,
  groundFriction: 2600,
  airFriction: 600,
  maxRunSpeed: 430,
  maxFallSpeed: 1100,
  glideFallSpeed: 160,
  fixedStep: 1 / 120,
};

export interface LocomotionResult {
  body: LocomotionBody;
  memory: LocomotionMemory;
  /** True on the frame a jump actually launched — for sound/particles. */
  jumped: boolean;
}

interface Runtime {
  position: Vec2;
  velocity: Vec2;
  memory: LocomotionMemory;
  jumped: boolean;
}

const SMALLEST_STEP = 1 / 1000;

const isNearApex = (verticalSpeed: number, tuning: LocomotionTuning): boolean =>
  Math.abs(verticalSpeed) < tuning.apexThreshold;

const gravityScale = (
  verticalSpeed: number,
  tuning: LocomotionTuning,
): number => {
  if (isNearApex(verticalSpeed, tuning)) return tuning.apexGravityMultiplier;
  return verticalSpeed > 0 ? tuning.fallGravityMultiplier : 1;
};

/** Lighter gravity at the apex buys a matching sliver of extra air control. */
const apexControlBonus = (tuning: LocomotionTuning): number =>
  1 + (1 - tuning.apexGravityMultiplier) * 0.5;

const tickTimers = (
  runtime: Runtime,
  grounded: boolean,
  tuning: LocomotionTuning,
  step: number,
): void => {
  runtime.memory.coyoteRemaining = grounded
    ? tuning.coyoteTime
    : Math.max(0, runtime.memory.coyoteRemaining - step);
  runtime.memory.jumpBufferRemaining = Math.max(
    0,
    runtime.memory.jumpBufferRemaining - step,
  );
};

const launchJumpWhenArmed = (
  runtime: Runtime,
  tuning: LocomotionTuning,
): void => {
  const armed =
    runtime.memory.jumpBufferRemaining > 0 &&
    runtime.memory.coyoteRemaining > 0;
  if (!armed) return;

  runtime.velocity.y = -tuning.jumpVelocity;
  runtime.memory.jumpBufferRemaining = 0;
  runtime.memory.coyoteRemaining = 0;
  runtime.memory.isJumping = true;
  runtime.jumped = true;
};

const applyJumpCut = (
  runtime: Runtime,
  jumpHeld: boolean,
  tuning: LocomotionTuning,
): void => {
  const rising = runtime.velocity.y < 0;
  if (!runtime.memory.isJumping || jumpHeld || !rising) return;

  runtime.velocity.y *= tuning.jumpCutMultiplier;
  runtime.memory.isJumping = false;
};

const applyVertical = (
  runtime: Runtime,
  input: LocomotionInput,
  grounded: boolean,
  tuning: LocomotionTuning,
  step: number,
): void => {
  runtime.velocity.y +=
    tuning.gravity * gravityScale(runtime.velocity.y, tuning) * step;

  if (input.glideHeld && runtime.velocity.y > 0) {
    runtime.velocity.y = Math.min(runtime.velocity.y, tuning.glideFallSpeed);
  }
  runtime.velocity.y = Math.min(runtime.velocity.y, tuning.maxFallSpeed);

  if (grounded && runtime.velocity.y > 0) runtime.velocity.y = 0;
  if (runtime.velocity.y >= 0) runtime.memory.isJumping = false;
};

const horizontalAcceleration = (
  runtime: Runtime,
  axis: number,
  grounded: boolean,
  tuning: LocomotionTuning,
): number => {
  const airborneAcceleration = isNearApex(runtime.velocity.y, tuning)
    ? tuning.airAcceleration * apexControlBonus(tuning)
    : tuning.airAcceleration;
  const base = grounded ? tuning.groundAcceleration : airborneAcceleration;
  const turningAround =
    runtime.velocity.x !== 0 &&
    Math.sign(runtime.velocity.x) !== Math.sign(axis);

  return turningAround ? base * tuning.turnAroundMultiplier : base;
};

const applyFriction = (
  runtime: Runtime,
  grounded: boolean,
  tuning: LocomotionTuning,
  step: number,
): void => {
  const drop = (grounded ? tuning.groundFriction : tuning.airFriction) * step;
  runtime.velocity.x =
    Math.abs(runtime.velocity.x) <= drop
      ? 0
      : runtime.velocity.x - Math.sign(runtime.velocity.x) * drop;
};

const applyHorizontal = (
  runtime: Runtime,
  input: LocomotionInput,
  grounded: boolean,
  tuning: LocomotionTuning,
  step: number,
): void => {
  const axis = clamp(input.move, -1, 1);
  if (axis === 0) {
    applyFriction(runtime, grounded, tuning, step);
    return;
  }

  const acceleration = horizontalAcceleration(runtime, axis, grounded, tuning);
  /** Externally granted speed (a web-swing launch) is kept, never gained. */
  const speedLimit = Math.max(
    tuning.maxRunSpeed * Math.abs(axis),
    Math.abs(runtime.velocity.x),
  );
  runtime.velocity.x = clamp(
    runtime.velocity.x + axis * acceleration * step,
    -speedLimit,
    speedLimit,
  );
};

const advance = (
  runtime: Runtime,
  input: LocomotionInput,
  grounded: boolean,
  tuning: LocomotionTuning,
  step: number,
): void => {
  tickTimers(runtime, grounded, tuning, step);
  if (input.jumpPressed) {
    runtime.memory.jumpBufferRemaining = tuning.jumpBufferTime;
  }

  launchJumpWhenArmed(runtime, tuning);
  applyJumpCut(runtime, input.jumpHeld, tuning);
  applyVertical(runtime, input, grounded, tuning, step);
  applyHorizontal(runtime, input, grounded, tuning, step);

  runtime.position.x += runtime.velocity.x * step;
  runtime.position.y += runtime.velocity.y * step;
};

const substepCount = (dt: number, fixedStep: number): number =>
  Math.max(1, Math.ceil(dt / Math.max(fixedStep, SMALLEST_STEP)));

const toResult = (runtime: Runtime): LocomotionResult => ({
  body: { position: runtime.position, velocity: runtime.velocity },
  memory: runtime.memory,
  jumped: runtime.jumped,
});

export const stepLocomotion = (
  body: LocomotionBody,
  memory: LocomotionMemory,
  input: LocomotionInput,
  grounded: boolean,
  tuning: LocomotionTuning,
  dt: number,
): LocomotionResult => {
  const runtime: Runtime = {
    position: { ...body.position },
    velocity: { ...body.velocity },
    memory: { ...memory },
    jumped: false,
  };
  if (dt <= 0) return toResult(runtime);

  const steps = substepCount(dt, tuning.fixedStep);
  const step = dt / steps;

  for (let index = 0; index < steps; index += 1) {
    /** A key-down edge belongs to one substep only. */
    const substepInput =
      index === 0 ? input : { ...input, jumpPressed: false as const };
    advance(runtime, substepInput, grounded, tuning, step);
  }

  return toResult(runtime);
};
