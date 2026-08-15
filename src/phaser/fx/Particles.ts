import type Phaser from "phaser";

/**
 * The scuffs and sparks the game throws off: rooftop dust under a hard landing,
 * a burst of light where a blow connects.
 *
 * Everything is drawn procedurally into one `Graphics` and integrated by hand
 * against the frame delta, so there is no art to load, no tween or timer to
 * leak, and a level change is a single `reset`.
 */

interface Mote {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  /** Seconds this mote lives for. */
  life: number;
  /** Seconds elapsed. Retired once this reaches `life`. */
  age: number;
  gravity: number;
  color: number;
  alpha: number;
  /**
   * Seconds of travel drawn behind the mote. Zero is a soft round puff; a
   * sliver of a second is the smear a fast spark leaves, which is what stops a
   * burst reading as a handful of grey bubbles.
   */
  smear: number;
}

/**
 * Hard ceiling on live motes. Effects are fired from collision callbacks, and
 * one pathological frame should cost a few dropped sparks, not the frame rate.
 */
const MAX_MOTES = 220;

const DUST_COLOR = 0xd8e2f2;
const SPARK_COLOR = 0xeef8ff;

const between = (min: number, max: number): number =>
  min + Math.random() * (max - min);

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

export class Particles {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly motes: Mote[] = [];

  public constructor(scene: Phaser.Scene, depth = 10) {
    this.graphics = scene.add.graphics().setDepth(depth);
  }

  public get liveCount(): number {
    return this.motes.length;
  }

  /**
   * A puff kicked out sideways from a pair of feet. `power` runs 0 for a step
   * down to 1 for a landing that hurt.
   */
  public dust(x: number, y: number, power: number): void {
    const weight = clamp01(power);
    const count = Math.round(4 + weight * 12);

    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      this.push({
        x: x + between(-8, 8),
        y: y - between(0, 6),
        velocityX: side * between(30, 150) * (0.45 + weight),
        velocityY: -between(10, 90) * (0.4 + weight),
        radius: between(6, 12) + weight * 5,
        life: between(0.34, 0.62),
        age: 0,
        gravity: 240,
        color: DUST_COLOR,
        alpha: 0.07 + weight * 0.11,
        smear: 0,
      });
    }
  }

  /** A radial flash of light where something was hit. */
  public spark(x: number, y: number, power: number): void {
    const weight = clamp01(power);
    const count = Math.round(5 + weight * 11);

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + between(-0.3, 0.3);
      const speed = between(240, 520) * (0.5 + weight);
      this.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        radius: between(1.4, 2.6) + weight,
        life: between(0.12, 0.24),
        age: 0,
        gravity: 140,
        color: SPARK_COLOR,
        alpha: 0.8 + weight * 0.2,
        smear: 0.035,
      });
    }
  }

  /** Integrates and redraws. `deltaMs` is the scene delta; nothing assumes 60fps. */
  public update(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (!(seconds > 0)) {
      return;
    }

    this.graphics.clear();
    let live = 0;

    for (const mote of this.motes) {
      mote.age += seconds;
      if (mote.age >= mote.life) {
        continue;
      }

      mote.velocityY += mote.gravity * seconds;
      mote.x += mote.velocityX * seconds;
      mote.y += mote.velocityY * seconds;

      const remaining = 1 - mote.age / mote.life;
      this.draw(mote, remaining);

      this.motes[live] = mote;
      live += 1;
    }

    this.motes.length = live;
  }

  /** Drops everything drawn for the level being left; the emitter lives on. */
  public reset(): void {
    this.motes.length = 0;
    this.graphics.clear();
  }

  public destroy(): void {
    this.motes.length = 0;
    this.graphics.destroy();
  }

  /** A puff is a fading disc; a spark is the streak it cut on the way past. */
  private draw(mote: Mote, remaining: number): void {
    const alpha = mote.alpha * remaining;
    const radius = mote.radius * remaining;

    if (mote.smear === 0) {
      this.graphics.fillStyle(mote.color, alpha);
      this.graphics.fillCircle(mote.x, mote.y, radius);
      return;
    }

    this.graphics.lineStyle(Math.max(1, radius * 1.6), mote.color, alpha);
    this.graphics.lineBetween(
      mote.x - mote.velocityX * mote.smear,
      mote.y - mote.velocityY * mote.smear,
      mote.x,
      mote.y,
    );
  }

  private push(mote: Mote): void {
    if (this.motes.length >= MAX_MOTES) {
      return;
    }
    this.motes.push(mote);
  }
}
