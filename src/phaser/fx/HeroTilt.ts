import type { PlayerMode } from "../actors/PlayerController";

/** The slice of a sprite a tilt writes to. Narrow, so this needs no engine. */
export interface Tiltable {
  setAngle(value: number): unknown;
}

/**
 * Leans the hero into the direction they are travelling.
 *
 * Arcade bodies are axis-aligned and ignore the sprite's rotation, so this is
 * presentation only: nothing it writes can reach the collision box.
 */

/** Horizontal speed that earns a full lean. Roughly a committed swing. */
const FULL_LEAN_SPEED = 900;

/** Degrees at full speed. A swing hangs off the line; a jump barely tips. */
const MAX_LEAN = { swinging: 26, airborne: 11, grounded: 0 };

/**
 * Time constant of the approach, in milliseconds. The step is
 * `1 - e^(-dt/TAU)`, which lands on the same lean per unit of *time* whatever
 * the frame rate — a flat per-frame fraction would lean twice as fast at 120fps.
 */
const TAU = 90;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export class HeroTilt {
  private readonly sprite: Tiltable;
  private angle = 0;

  public constructor(sprite: Tiltable) {
    this.sprite = sprite;
  }

  public get currentAngle(): number {
    return this.angle;
  }

  public update(mode: PlayerMode, velocityX: number, deltaMs: number): void {
    if (!(deltaMs > 0)) {
      return;
    }

    const target = clamp(velocityX / FULL_LEAN_SPEED, -1, 1) * MAX_LEAN[mode];
    this.angle += (target - this.angle) * (1 - Math.exp(-deltaMs / TAU));
    this.sprite.setAngle(this.angle);
  }

  /** Upright again: for a respawn, or for a pose the scene sets by hand. */
  public reset(): void {
    this.angle = 0;
    this.sprite.setAngle(0);
  }
}
