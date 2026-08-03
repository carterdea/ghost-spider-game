import type Phaser from "phaser";

/**
 * The moment a blow lands, made legible: the world holds still for a beat, the
 * camera kicks, and whatever was hit goes white.
 *
 * Nothing here owns a tween or a timer. Every effect is a timestamp compared
 * against the scene clock, so a level change only has to call `reset` and there
 * is nothing left over to leak.
 */

/** Freeze frames, in real milliseconds, from a glancing blow to a takedown. */
const FREEZE_MS = { min: 40, max: 130 };

/**
 * Sim time still advances during a freeze, at a twentieth of real time. A true
 * zero would be a divide-by-nothing for anything integrating the delta; this
 * reads as a dead stop and keeps every downstream number well defined.
 */
const FREEZE_RATE = 0.05;

const SHAKE_MS = { min: 90, max: 240 };
const SHAKE_AMOUNT = { min: 0.003, max: 0.013 };

/** How long a struck sprite stays blown out to white. */
const FLASH_MS = 90;

const FLASH_COLOR = 0xffffff;

const lerp = (from: number, to: number, t: number): number =>
  from + (to - from) * t;

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

interface Flash {
  sprite: Phaser.GameObjects.Sprite;
  until: number;
}

export class Impact {
  private readonly scene: Phaser.Scene;
  private freezeUntil = 0;
  private readonly flashes: Flash[] = [];

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * A blow landed. `power` runs 0 for a graze to 1 for a takedown and scales
   * all three cues together, so the feedback reads as one event rather than
   * three that happen to coincide.
   */
  public strike(power: number, victim?: Phaser.GameObjects.Sprite): void {
    const weight = clamp01(power);
    this.freeze(lerp(FREEZE_MS.min, FREEZE_MS.max, weight));
    this.scene.cameras.main.shake(
      lerp(SHAKE_MS.min, SHAKE_MS.max, weight),
      lerp(SHAKE_AMOUNT.min, SHAKE_AMOUNT.max, weight),
    );
    if (victim) {
      this.flash(victim);
    }
  }

  /** A knock the hero took: the camera kicks, but nothing freezes. */
  public shake(power: number): void {
    const weight = clamp01(power);
    this.scene.cameras.main.shake(
      lerp(SHAKE_MS.min, SHAKE_MS.max, weight),
      lerp(SHAKE_AMOUNT.min, SHAKE_AMOUNT.max, weight),
    );
  }

  /** Blows a sprite out to white for a beat. Safe to re-flash mid-flash. */
  public flash(sprite: Phaser.GameObjects.Sprite): void {
    const existing = this.flashes.find((entry) => entry.sprite === sprite);
    const until = this.scene.time.now + FLASH_MS;
    if (existing) {
      existing.until = until;
      return;
    }
    sprite.setTintFill(FLASH_COLOR);
    this.flashes.push({ sprite, until });
  }

  /** Holds the world for `duration` real milliseconds. The longer wins. */
  public freeze(duration: number): void {
    this.freezeUntil = Math.max(
      this.freezeUntil,
      this.scene.time.now + duration,
    );
  }

  public get frozen(): boolean {
    return this.scene.time.now < this.freezeUntil;
  }

  /**
   * Run once per frame with the scene's delta. Returns the delta the simulation
   * should actually step, which is where the hit-stop lives, and retires any
   * flash that has run its course.
   */
  public step(deltaMs: number): number {
    this.expireFlashes();
    return this.frozen ? deltaMs * FREEZE_RATE : deltaMs;
  }

  /** Drops every effect. Called when a level is torn down. */
  public reset(): void {
    this.freezeUntil = 0;
    for (const flash of this.flashes) {
      clearFlash(flash.sprite);
    }
    this.flashes.length = 0;
    this.scene.cameras.main.shakeEffect.reset();
  }

  /** Compacts in place: this runs every frame and usually has nothing to do. */
  private expireFlashes(): void {
    if (this.flashes.length === 0) {
      return;
    }

    const now = this.scene.time.now;
    let live = 0;
    for (const flash of this.flashes) {
      if (now >= flash.until) {
        clearFlash(flash.sprite);
        continue;
      }
      this.flashes[live] = flash;
      live += 1;
    }
    this.flashes.length = live;
  }
}

/** A sprite destroyed mid-flash has no tint to clear and must not throw. */
const clearFlash = (sprite: Phaser.GameObjects.Sprite): void => {
  if (sprite.active) {
    sprite.clearTint();
  }
};
