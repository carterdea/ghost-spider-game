import {
  add,
  clamp,
  distance,
  dot,
  length,
  normalize,
  scale,
  subtract,
  type Vec2,
} from "../physics/vector";

export interface SwingBody {
  position: Vec2;
  velocity: Vec2;
}

export interface Rope {
  anchor: Vec2;
  length: number;
}

export interface SwingInput {
  /** -1 reel in, +1 let out, 0 hold. */
  reel: number;
  /** -1 pump backward, +1 pump forward along travel, 0 none. */
  pump: number;
}

export interface SwingTuning {
  gravity: number;
  minRopeLength: number;
  maxRopeLength: number;
  reelSpeed: number;
  pumpAcceleration: number;
  /** Per-second velocity retention, 1 = frictionless. */
  drag: number;
  maxSpeed: number;
  fixedStep: number;
}

export const DEFAULT_SWING_TUNING: SwingTuning = {
  gravity: 1800,
  minRopeLength: 90,
  maxRopeLength: 560,
  reelSpeed: 260,
  pumpAcceleration: 900,
  drag: 0.995,
  maxSpeed: 1600,
  fixedStep: 1 / 240,
};

/** Ceiling on sub-steps so a pathological dt cannot stall the simulation. */
const MAX_SUBSTEPS = 240;

/** Slack below this still counts as taut; absorbs float error from the solve. */
const TAUT_EPSILON = 1e-9;

const ZERO: Vec2 = { x: 0, y: 0 };

const cloneVec = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });

const cloneBody = (body: SwingBody): SwingBody => ({
  position: cloneVec(body.position),
  velocity: cloneVec(body.velocity),
});

const cloneRope = (rope: Rope): Rope => ({
  anchor: cloneVec(rope.anchor),
  length: rope.length,
});

/** Left normal of the radial direction: the direction the hero swings along. */
const tangentOf = (radial: Vec2): Vec2 => ({ x: -radial.y, y: radial.x });

export const ropeLengthFor = (
  from: Vec2,
  anchor: Vec2,
  tuning: SwingTuning,
): number =>
  clamp(distance(from, anchor), tuning.minRopeLength, tuning.maxRopeLength);

export const isTaut = (body: SwingBody, rope: Rope): boolean =>
  distance(body.position, rope.anchor) >= rope.length - TAUT_EPSILON;

const reeledLength = (
  rope: Rope,
  input: SwingInput,
  tuning: SwingTuning,
  step: number,
): number =>
  clamp(
    rope.length + clamp(input.reel, -1, 1) * tuning.reelSpeed * step,
    tuning.minRopeLength,
    tuning.maxRopeLength,
  );

/**
 * Pumping only bites while the rope is taut: it pushes along the tangent in the
 * direction the hero already travels, which is how a real swing gains energy.
 */
const pumpAccelerationOn = (
  body: SwingBody,
  rope: Rope,
  input: SwingInput,
  tuning: SwingTuning,
): Vec2 => {
  const pump = clamp(input.pump, -1, 1);
  if (pump === 0 || !isTaut(body, rope)) {
    return ZERO;
  }

  const tangent = tangentOf(normalize(subtract(body.position, rope.anchor)));
  const travel = dot(body.velocity, tangent);
  if (travel === 0) {
    return ZERO;
  }

  return scale(tangent, Math.sign(travel) * pump * tuning.pumpAcceleration);
};

const accelerationOn = (
  body: SwingBody,
  rope: Rope,
  input: SwingInput,
  tuning: SwingTuning,
): Vec2 =>
  add(
    { x: 0, y: tuning.gravity },
    pumpAccelerationOn(body, rope, input, tuning),
  );

const dampened = (velocity: Vec2, drag: number, step: number): Vec2 =>
  drag === 1 ? velocity : scale(velocity, drag ** step);

const speedLimited = (velocity: Vec2, maxSpeed: number): Vec2 => {
  const speed = length(velocity);
  return speed > maxSpeed ? scale(velocity, maxSpeed / speed) : velocity;
};

/** Smallest displacement along `radial` that puts `offset` back on the circle. */
const constraintCorrection = (
  offset: Vec2,
  radial: Vec2,
  ropeLength: number,
): number => {
  // Solve |offset + lambda * radial| = ropeLength for the root nearest zero.
  const half = dot(offset, radial);
  const discriminant = half * half - (dot(offset, offset) - ropeLength ** 2);
  if (discriminant < 0) {
    return Number.NaN;
  }

  const root = Math.sqrt(discriminant);
  const near = -half + root;
  const far = -half - root;
  return Math.abs(near) <= Math.abs(far) ? near : far;
};

/**
 * Hard distance constraint. The correction runs along the radial direction the
 * hero *entered* the step with, which is what keeps the integrator symplectic
 * and the pendulum's energy flat; correcting along the post-move radius bleeds
 * energy every step. A slack rope is inert and this never runs.
 */
const constrainedPosition = (
  predicted: Vec2,
  rope: Rope,
  radial: Vec2,
): Vec2 => {
  const offset = subtract(predicted, rope.anchor);
  const reach = length(offset);
  if (reach <= rope.length) {
    return predicted;
  }

  const correction = constraintCorrection(offset, radial, rope.length);
  if (Number.isFinite(correction)) {
    return add(predicted, scale(radial, correction));
  }

  // No solution along the entry radius (only reachable with an absurd step):
  // fall back to the plain radial snap, which always lands on the circle.
  return add(rope.anchor, scale(scale(offset, 1 / reach), rope.length));
};

/** Drop any outward radial velocity, leaving the tangential component intact. */
const tangentialVelocity = (
  position: Vec2,
  velocity: Vec2,
  rope: Rope,
): Vec2 => {
  const offset = subtract(position, rope.anchor);
  const reach = length(offset);
  if (reach === 0 || reach < rope.length - TAUT_EPSILON) {
    return velocity;
  }

  const radial = scale(offset, 1 / reach);
  const outward = dot(velocity, radial);
  return outward > 0 ? subtract(velocity, scale(radial, outward)) : velocity;
};

/** One RATTLE sub-step: half kick, constrained drift, half kick, projection. */
const advance = (
  body: SwingBody,
  rope: Rope,
  input: SwingInput,
  tuning: SwingTuning,
  step: number,
): { body: SwingBody; rope: Rope } => {
  const next: Rope = {
    anchor: rope.anchor,
    length: reeledLength(rope, input, tuning, step),
  };
  const acceleration = accelerationOn(body, next, input, tuning);
  const halfKick = add(body.velocity, scale(acceleration, step / 2));
  const entryRadial = normalize(subtract(body.position, next.anchor));
  const position = constrainedPosition(
    add(body.position, scale(halfKick, step)),
    next,
    entryRadial,
  );

  const drifted = scale(subtract(position, body.position), 1 / step);
  const velocity = tangentialVelocity(
    position,
    speedLimited(
      dampened(add(drifted, scale(acceleration, step / 2)), tuning.drag, step),
      tuning.maxSpeed,
    ),
    next,
  );

  return { body: { position, velocity }, rope: next };
};

const substepCount = (dt: number, fixedStep: number): number =>
  clamp(Math.ceil(dt / fixedStep), 1, MAX_SUBSTEPS);

export const stepSwing = (
  body: SwingBody,
  rope: Rope,
  input: SwingInput,
  tuning: SwingTuning,
  dt: number,
): { body: SwingBody; rope: Rope } => {
  if (!(dt > 0)) {
    return { body: cloneBody(body), rope: cloneRope(rope) };
  }

  const steps = substepCount(dt, tuning.fixedStep);
  const step = dt / steps;
  let current: { body: SwingBody; rope: Rope } = {
    body: cloneBody(body),
    rope: cloneRope(rope),
  };

  for (let index = 0; index < steps; index += 1) {
    current = advance(current.body, current.rope, input, tuning, step);
  }

  return { body: cloneBody(current.body), rope: cloneRope(current.rope) };
};
