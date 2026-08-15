import type Phaser from "phaser";

/**
 * A recording stand-in for `Phaser.Scene`, used by the lifecycle tests.
 *
 * Phaser cannot boot under happy-dom (its canvas feature detection needs a real
 * 2D context), so the tests drive the real builders and renderers against this
 * double and count what is still alive afterwards. It records rather than
 * simulates: nothing here reimplements game logic.
 */

class FakeGameObject {
  public x = 0;
  public y = 0;
  public depth = 0;
  public alpha = 1;
  public rotation = 0;
  public displayWidth = 0;
  public displayHeight = 0;
  public destroyCount = 0;
  public scrollFactorX = 1;
  public scrollFactorY = 1;
  public visible = true;

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

  public setAlpha(alpha = 1): this {
    this.alpha = alpha;
    return this;
  }

  public setRotation(rotation = 0): this {
    this.rotation = rotation;
    return this;
  }

  public setScrollFactor(x = 1, y = x): this {
    this.scrollFactorX = x;
    this.scrollFactorY = y;
    return this;
  }

  public setBlendMode(): this {
    return this;
  }

  public setTint(): this {
    return this;
  }

  public setFlipX(): this {
    return this;
  }

  public setFlipY(): this {
    return this;
  }

  public setOrigin(): this {
    return this;
  }

  public setScale(): this {
    return this;
  }

  public setVisible(visible = true): this {
    this.visible = visible;
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

/** A tiled object, which is scrolled by its texture offset rather than moved. */
export class FakeTileSprite extends FakeGameObject {
  public tilePositionX = 0;
  public tilePositionY = 0;
  public tileScaleX = 1;
  public tileScaleY = 1;
  public width = 0;
  public height = 0;

  public constructor() {
    super("tileSprite");
  }

  public setTileScale(x = 1, y = x): this {
    this.tileScaleX = x;
    this.tileScaleY = y;
    return this;
  }

  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }
}

/** Every draw call is a no-op; only `generateTexture` is worth recording. */
class FakeGraphics extends FakeGameObject {
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

class FakeTween {
  public removed = false;

  public constructor(
    public readonly targets: unknown,
    public readonly onComplete?: () => void,
    /** Held so a test can drive a schedule tween frame by frame. */
    public readonly onUpdate?: () => void,
  ) {}

  public remove(): void {
    this.removed = true;
  }
}

/**
 * A dynamic Arcade body, as a moving deck sees one: a footprint and the game
 * object it reads its position back from.
 *
 * The double does not model origins, so the position is the game object's own
 * — which makes it the body's top-left corner, the corner Arcade measures its
 * width and height from.
 */
class FakeBody {
  public enable = true;

  public constructor(
    public readonly gameObject: FakeGameObject,
    public readonly width: number,
    public readonly height: number,
  ) {}

  /** Arcade re-derives this from the game object every step, and so does this. */
  public get position(): { x: number; y: number } {
    return { x: this.gameObject.x, y: this.gameObject.y };
  }
}

export interface FakeTimer {
  delay: number;
  callback: () => void;
  removed: boolean;
  fired: boolean;
}

class FakeCollider {
  public destroyed = false;

  public destroy(): void {
    this.destroyed = true;
  }
}

class FakeStaticGroup {
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

/** The slice of the world a camera is showing, as the weather reads it. */
class FakeWorldView {
  public x = 0;
  public y = 0;
  public width = 1280;
  public height = 720;

  public get centerX(): number {
    return this.x + this.width / 2;
  }

  public get centerY(): number {
    return this.y + this.height / 2;
  }
}

/** The camera as the fx layer uses it: it records kicks instead of shaking. */
class FakeCamera {
  public readonly shakes: { duration: number; amount: number }[] = [];
  public shakeResets = 0;
  public readonly worldView = new FakeWorldView();

  /** Puts the view's centre where a test wants it. */
  public centerOn(x: number, y: number): this {
    this.worldView.x = x - this.worldView.width / 2;
    this.worldView.y = y - this.worldView.height / 2;
    return this;
  }

  public readonly shakeEffect = {
    reset: (): void => {
      this.shakeResets += 1;
    },
  };

  public shake(duration: number, amount: number): void {
    this.shakes.push({ duration, amount });
  }
}

type SceneHandler = (...args: never[]) => void;

/**
 * The scene's own event bus, recorded. Systems that drive themselves off the
 * scene's update rather than being stepped by it have to give their listener
 * back when they are destroyed, and `count` is how a test proves they did.
 */
class FakeEvents {
  private readonly listeners = new Map<
    string,
    { handler: SceneHandler; once: boolean }[]
  >();

  public on(event: string, handler: SceneHandler): this {
    return this.add(event, handler, false);
  }

  public once(event: string, handler: SceneHandler): this {
    return this.add(event, handler, true);
  }

  public off(event: string, handler: SceneHandler): this {
    const bound = this.listeners.get(event);
    if (bound) {
      this.listeners.set(
        event,
        bound.filter((entry) => entry.handler !== handler),
      );
    }
    return this;
  }

  public emit(event: string, ...args: never[]): this {
    for (const entry of [...(this.listeners.get(event) ?? [])]) {
      if (entry.once) {
        this.off(event, entry.handler);
      }
      entry.handler(...args);
    }
    return this;
  }

  public count(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  private add(event: string, handler: SceneHandler, once: boolean): this {
    const bound = this.listeners.get(event) ?? [];
    bound.push({ handler, once });
    this.listeners.set(event, bound);
    return this;
  }
}

export class SceneDouble {
  public readonly objects: FakeGameObject[] = [];
  public readonly tweenLog: FakeTween[] = [];
  public readonly timerLog: FakeTimer[] = [];
  public readonly colliderLog: FakeCollider[] = [];
  public readonly groupLog: FakeStaticGroup[] = [];
  public readonly bodyLog: FakeBody[] = [];
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
    tileSprite: (
      x: number,
      y: number,
      width: number,
      height: number,
    ): FakeTileSprite =>
      this.record(new FakeTileSprite())
        .setSize(width, height)
        .setPosition(x, y),
    graphics: (): FakeGraphics => this.record(new FakeGraphics(this)),
  };

  public readonly tweens = {
    add: (config: {
      targets: unknown;
      onComplete?: () => void;
      onUpdate?: () => void;
    }): FakeTween => {
      const tween = new FakeTween(
        config.targets,
        config.onComplete,
        config.onUpdate,
      );
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
    pauseAll: (): void => {
      this.tweensPaused = true;
    },
    resumeAll: (): void => {
      this.tweensPaused = false;
    },
  };

  /** Whether the manager is holding every tween. Read by tests. */
  public tweensPaused = false;

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

  public readonly cameras = { main: new FakeCamera() };

  public readonly events = new FakeEvents();

  public readonly physics = {
    /** `isPaused` is the hit-stop's handle on the simulation. */
    world: {
      isPaused: false,
      /** Everything a moving deck could be carrying. */
      bodies: { getArray: (): FakeBody[] => this.bodyLog },
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

  /**
   * A dynamic body in the world, positioned by its top-left corner. Returned
   * so a test can watch where a moving deck leaves it.
   */
  public addBody(
    x: number,
    y: number,
    width: number,
    height: number,
  ): FakeBody {
    const object = this.record(new FakeGameObject("sprite")).setPosition(x, y);
    const body = new FakeBody(object, width, height);
    this.bodyLog.push(body);
    return body;
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
