import type Phaser from "phaser";

/**
 * Every resource created for the level currently loaded — objects, tweens,
 * timers, colliders and the platform bodies — held together so a transition can
 * retire all of it in one call.
 *
 * Destroying a tween's target does not remove an infinitely repeating tween
 * from the tween manager, and a delayed call outlives whatever it captured, so
 * both need explicit handles rather than a sweep over display objects.
 */
export class LevelWorld {
  public readonly platforms: Phaser.Physics.Arcade.StaticGroup;

  private readonly scene: Phaser.Scene;
  private readonly objects = new Set<Phaser.GameObjects.GameObject>();
  private readonly tweens = new Set<Phaser.Tweens.Tween>();
  private readonly timers = new Set<Phaser.Time.TimerEvent>();
  private readonly colliders = new Set<Phaser.Physics.Arcade.Collider>();
  private destroyed = false;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.platforms = scene.physics.add.staticGroup();
  }

  public track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.add(object);
    return object;
  }

  public tween(
    config: Phaser.Types.Tweens.TweenBuilderConfig,
  ): Phaser.Tweens.Tween {
    const tween = this.scene.tweens.add(config);
    this.tweens.add(tween);
    return tween;
  }

  /** A delayed call that never fires once the level it belongs to is gone. */
  public delay(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.timers.delete(timer);
      callback();
    });
    this.timers.add(timer);
    return timer;
  }

  public collider(collider: Phaser.Physics.Arcade.Collider): void {
    this.colliders.add(collider);
  }

  /** Retires an effect that finished on its own, before the level ended. */
  public discard(
    object: Phaser.GameObjects.GameObject,
    tween: Phaser.Tweens.Tween,
  ): void {
    this.tweens.delete(tween);
    this.objects.delete(object);
    object.destroy();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    for (const timer of this.timers) {
      this.scene.time.removeEvent(timer);
    }
    for (const tween of this.tweens) {
      tween.remove();
    }
    for (const collider of this.colliders) {
      collider.destroy();
    }
    for (const object of this.objects) {
      object.destroy();
    }

    this.timers.clear();
    this.tweens.clear();
    this.colliders.clear();
    this.objects.clear();

    this.platforms.clear(true, true);
    this.platforms.destroy();
  }
}
