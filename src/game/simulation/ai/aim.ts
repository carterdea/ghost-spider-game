import {
  distance,
  normalize,
  scale,
  subtract,
  type Vec2,
} from "../physics/vector";

/**
 * Where a mover will be by the time something travelling at `travelSpeed`
 * reaches it. `factor` below 1 deliberately under-leads so a hero who changes
 * direction mid-swing beats the prediction.
 */
export const predictPosition = (
  origin: Vec2,
  target: Vec2,
  targetVelocity: Vec2,
  travelSpeed: number,
  factor: number,
  maxLeadTime: number,
): Vec2 => {
  const flightTime =
    travelSpeed > 0 ? distance(origin, target) / travelSpeed : maxLeadTime;
  const lead = Math.min(flightTime, maxLeadTime) * factor;
  return {
    x: target.x + targetVelocity.x * lead,
    y: target.y + targetVelocity.y * lead,
  };
};

/** Velocity for a projectile fired from `origin` at a point, magnitude `speed`. */
export const velocityToward = (
  origin: Vec2,
  point: Vec2,
  speed: number,
): Vec2 => scale(normalize(subtract(point, origin)), speed);
