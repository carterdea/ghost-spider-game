import type Phaser from "phaser";

/**
 * A recording stand-in for `Phaser.Scene`, used by the lifecycle tests.
 *
 * Phaser cannot boot under happy-dom (its canvas feature detection needs a real
 * 2D context), so the tests drive the real builders and renderers against this
 * double and count what is still alive afterwards. It records rather than
 * simulates: nothing here reimplements game logic.
 */

export class FakeGameObject {
  public x = 0;
  public y = 0;
  public depth = 0;
  public displayWidth = 0;
  public displayHeight = 0;
  public destroyCount = 0;

  public constructor(
    public readonly kind: string,
    public readonly texture: string = "",
  ) {}

  public setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  public setDisplaySize(width: number, height: number): this {
    this.displayWidth = width;
    this.displayHeight = height;
    return this;
  }

  public setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  public setAlpha(): this {
    return this;
  }

  public setTint(): this {
    return this;
  }

  public setFlipX(): this {
    return this;
  }

  public setOrigin(): this {
    return this;
  }

  public setScale(): this {
    return this;
  }

  public setVisible(): this {
    return this;
  }

  public refreshBody(): this {
    return this;
  }

  public get destroyed(): boolean {
    return this.destroyCount > 0;
  }

  public destroy(): void {
    this.destroyCount += 1;
  }
}

/** Every draw call is a no-op; only `generateTexture` is worth recording. */
export class FakeGraphics extends FakeGameObject {
  public constructor(private readonly scene: SceneDouble) {
    super("graphics");
  }

  public clear(): this {
    return this;
  }

  public lineStyle(): this {
    return this;
  }

  public fillStyle(): this {
    return this;
  }

  public beginPath(): this {
    return this;
  }

  public moveTo(): this {
    return this;
  }

  public lineTo(): this {
    return this;
  }

  public strokePath(): this {
    return this;
  }

  public lineBetween(): this {
    return this;
  }

  public strokeCircle(): this {
    return this;
  }

  public fillCircle(): this {
    return this;
  }

  public strokeEllipse(): this {
    return this;
  }

  public fillEllipse(): this {
    return this;
  }

  public fillRect(): this {
    return this;
  }

  public strokeRect(): this {
    return this;
  }

  public fillRoundedRect(): this {
    return this;
  }

  public strokeRoundedRect(): this {
    return this;
  }

  public fillTriangle(): this {
    return this;
  }

  public generateTexture(key: string): this {
    this.scene.generatedTextures.push(key);
    this.scene.existingTextures.add(key);
    return this;
  }
}

export class FakeTween {
  public removed = false;

  public constructor(
    public readonly targets: unknown,
    public readonly onComplete?: () => void,
  ) {}

  public remove(): void {
    this.removed = true;
  }
}

export interface FakeTimer {
  delay: number;
  callback: () => void;
  removed: boolean;
  fired: boolean;
}

export class FakeCollider {
  public destroyed = false;

  public destroy(): void {
    this.destroyed = true;
  }
}

export class FakeStaticGroup {
  public readonly children: FakeGameObject[] = [];
  public destroyed = false;

  public constructor(private readonly scene: SceneDouble) {}

  public create(x: number, y: number, texture: string): FakeGameObject {
    const body = this.scene.record(new FakeGameObject("staticSprite", texture));
    body.setPosition(x, y);
    this.children.push(body);
    return body;
  }

  public clear(destroyChild: boolean, _removeFromScene: boolean): this {
    if (destroyChild) {
      for (const child of this.children) {
        child.destroy();
      }
    }
    this.children.length = 0;
    return this;
  }

  public destroy(): void {
    this.destroyed = true;
  }
}

export class SceneDouble {
  public readonly objects: FakeGameObject[] = [];
  public readonly tweenLog: FakeTween[] = [];
  public readonly timerLog: FakeTimer[] = [];
  public readonly colliderLog: FakeCollider[] = [];
  public readonly groupLog: FakeStaticGroup[] = [];
  public readonly generatedTextures: string[] = [];
  public readonly existingTextures = new Set<string>();
  public readonly removedTextures: string[] = [];
  public worldBounds: readonly number[] = [];
  public now = 0;

  public record<T extends FakeGameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  public readonly add = {
    rectangle: (x: number, y: number): FakeGameObject =>
      this.record(new FakeGameObject("rectangle")).setPosition(x, y),
    image: (x: number, y: number, texture: string): FakeGameObject =>
      this.record(new FakeGameObject("image", texture)).setPosition(x, y),
    tileSprite: (x: number, y: number): FakeGameObject =>
      this.record(new FakeGameObject("tileSprite")).setPosition(x, y),
    graphics: (): FakeGraphics => this.record(new FakeGraphics(this)),
  };

  public readonly tweens = {
    add: (config: { targets: unknown; onComplete?: () => void }): FakeTween => {
      const tween = new FakeTween(config.targets, config.onComplete);
      this.tweenLog.push(tween);
      return tween;
    },
    killTweensOf: (target: unknown): void => {
      for (const tween of this.tweenLog) {
        if (tween.targets === target) {
          tween.remove();
        }
      }
    },
  };

  public readonly time = {
    get now(): number {
      return 0;
    },
    delayedCall: (delay: number, callback: () => void): FakeTimer => {
      const timer: FakeTimer = {
        delay,
        callback,
        removed: false,
        fired: false,
      };
      this.timerLog.push(timer);
      return timer;
    },
    removeEvent: (timer: FakeTimer): void => {
      timer.removed = true;
    },
  };

  public readonly textures = {
    exists: (key: string): boolean => this.existingTextures.has(key),
    remove: (key: string): void => {
      this.removedTextures.push(key);
      this.existingTextures.delete(key);
    },
  };

  public readonly physics = {
    world: {
      setBounds: (
        x: number,
        y: number,
        width: number,
        height: number,
      ): void => {
        this.worldBounds = [x, y, width, height];
      },
    },
    add: {
      staticGroup: (): FakeStaticGroup => {
        const group = new FakeStaticGroup(this);
        this.groupLog.push(group);
        return group;
      },
    },
  };

  public constructor() {
    // `time.now` is read through a getter on the double itself so tests can
    // advance the clock with `scene.now = ...`.
    Object.defineProperty(this.time, "now", { get: () => this.now });
  }

  /** A collider handle the systems under test can hold and later destroy. */
  public newCollider(): FakeCollider {
    const collider = new FakeCollider();
    this.colliderLog.push(collider);
    return collider;
  }

  /** Fires a pending timer the way Phaser's clock would. */
  public runTimer(timer: FakeTimer): void {
    if (timer.removed || timer.fired) {
      return;
    }
    timer.fired = true;
    timer.callback();
  }

  public liveObjects(): FakeGameObject[] {
    return this.objects.filter((object) => !object.destroyed);
  }

  public liveTweens(): FakeTween[] {
    return this.tweenLog.filter((tween) => !tween.removed);
  }

  public liveTimers(): FakeTimer[] {
    return this.timerLog.filter((timer) => !timer.removed && !timer.fired);
  }

  public liveGroups(): FakeStaticGroup[] {
    return this.groupLog.filter((group) => !group.destroyed);
  }

  public liveColliders(): FakeCollider[] {
    return this.colliderLog.filter((collider) => !collider.destroyed);
  }

  public liveBodies(): FakeGameObject[] {
    return this.groupLog.flatMap((group) => group.children);
  }
}

/**
 * The doubles satisfy the slice of Phaser the systems under test touch; these
 * keep the casts in one place instead of scattered through the tests.
 */
export const asScene = (double: SceneDouble): Phaser.Scene =>
  double as unknown as Phaser.Scene;

export const asGameObject = (
  object: FakeGameObject,
): Phaser.GameObjects.GameObject =>
  object as unknown as Phaser.GameObjects.GameObject;

export const asCollider = (
  collider: FakeCollider,
): Phaser.Physics.Arcade.Collider =>
  collider as unknown as Phaser.Physics.Arcade.Collider;
