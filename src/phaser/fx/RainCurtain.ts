import type Phaser from "phaser";
import { clamp } from "../../game/simulation/physics/vector";
import {
  leanAt,
  MAX_SPLASHES,
  RAIN_LAYERS,
  rainScroll,
  SPLASH_DEPTH,
  SPLASH_RATE,
  type Weather,
} from "./weather";

/**
 * Rain, as three scrolling sheets and a handful of splashes.
 *
 * Each sheet is one `TileSprite` pinned to the camera and rotated into the wind,
 * so the whole storm costs three quads a frame however hard it is falling —
 * there is no per-drop anything. Depth comes from the sheets disagreeing: the
 * far one barely reacts to the camera, the near one is pinned to the world and
 * rushes past. What actually sells the wet is the last part, the splashes struck
 * along the roof lines the camera can see, and those are a small pool drawn into
 * one `Graphics`.
 *
 * The curtain drives itself off the scene's own update event rather than being
 * stepped by the scene, so a level can own weather without the scene knowing
 * about it. It stops the moment the scene is paused or shut down.
 */

/** A surface rain can land on: a roof line, or the street. */
export interface RainSurface {
  readonly left: number;
  readonly right: number;
  readonly y: number;
}

interface Splash {
  x: number;
  y: number;
  /** Seconds elapsed, against a fixed life. */
  age: number;
  life: number;
  width: number;
}

/** Phaser's own event names, spelled out so this module need not import Phaser. */
const SCENE_UPDATE = "update";
const SCENE_SHUTDOWN = "shutdown";

/** Redrawing a sheet's geometry is only worth it once the view really changed. */
const RESIZE_SLACK = 48;

/**
 * A square that still covers the view once it has been turned into the wind,
 * with more margin than `RESIZE_SLACK` can eat between two resizes.
 */
const sheetSizeFor = (viewWidth: number, viewHeight: number): number =>
  Math.ceil(Math.hypot(viewWidth, viewHeight)) + 96;

const SPLASH_COLOR = 0xcfe4ff;

export class RainCurtain {
  private readonly scene: Phaser.Scene;
  private readonly weather: Weather;
  private readonly surfaces: readonly RainSurface[];
  private readonly sheets: Phaser.GameObjects.TileSprite[];
  private readonly spray: Phaser.GameObjects.Graphics;
  private readonly splashes: Splash[] = [];

  private elapsed = 0;
  private sheetSize = 0;
  private splashDebt = 0;
  private previous?: { x: number; y: number };
  private destroyed = false;

  public constructor(
    scene: Phaser.Scene,
    weather: Weather,
    surfaces: readonly RainSurface[],
  ) {
    this.scene = scene;
    this.weather = weather;
    this.surfaces = surfaces;

    // Sized and placed against the view up front: a sheet that waited for its
    // first update would be drawn as a small square somewhere else for a frame.
    const view = scene.cameras.main.worldView;
    this.sheetSize = sheetSizeFor(view.width, view.height);
    this.sheets = RAIN_LAYERS.map((layer) =>
      scene.add
        .tileSprite(
          view.centerX,
          view.centerY,
          this.sheetSize,
          this.sheetSize,
          layer.texture,
        )
        .setDepth(layer.depth)
        .setAlpha(layer.alpha * weather.intensity)
        .setTileScale(layer.tileScale)
        .setScrollFactor(1),
    );
    this.spray = scene.add.graphics().setDepth(SPLASH_DEPTH);

    scene.events.on(SCENE_UPDATE, this.tick);
    scene.events.once(SCENE_SHUTDOWN, this.onShutdown);
  }

  public get liveSplashes(): number {
    return this.splashes.length;
  }

  /**
   * Slides every sheet by the camera's travel and the drops' own fall, then
   * spends what is left of the frame on splashes. `deltaMs` is the scene delta;
   * nothing here assumes a frame rate.
   *
   * The rain holds still whenever the simulation does. That flag covers both the
   * hit-stop after a blow lands and a held run, and reading it here is what lets
   * the weather stop with the world without the scene having to drive it.
   */
  public update(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (this.destroyed || !(seconds > 0)) {
      return;
    }
    if (this.scene.physics.world.isPaused) {
      return;
    }
    this.elapsed += deltaMs;

    const view = this.scene.cameras.main.worldView;
    const previous = this.previous ?? { x: view.centerX, y: view.centerY };
    const cameraDx = view.centerX - previous.x;
    const cameraDy = view.centerY - previous.y;
    this.previous = { x: view.centerX, y: view.centerY };

    const lean = leanAt(this.weather, this.elapsed, cameraDx / seconds);
    this.resize(view.width, view.height);

    for (const [index, sheet] of this.sheets.entries()) {
      const layer = RAIN_LAYERS[index];
      const scroll = rainScroll(
        layer,
        seconds,
        cameraDx,
        cameraDy,
        lean,
        this.weather.intensity,
      );
      sheet.setPosition(view.centerX, view.centerY);
      sheet.setRotation(lean);
      sheet.tilePositionX += scroll.x;
      sheet.tilePositionY += scroll.y;
    }

    this.strike(view, seconds);
    this.drawSpray(seconds);
  }

  /** Drops every splash in flight. The sheets carry no state worth clearing. */
  public reset(): void {
    this.splashes.length = 0;
    this.splashDebt = 0;
    this.previous = undefined;
    this.spray.clear();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.scene.events.off(SCENE_UPDATE, this.tick);
    this.scene.events.off(SCENE_SHUTDOWN, this.onShutdown);
    this.splashes.length = 0;
    for (const sheet of this.sheets) {
      sheet.destroy();
    }
    this.spray.destroy();
  }

  private readonly tick = (_time: number, delta: number): void => {
    this.update(delta);
  };

  private readonly onShutdown = (): void => {
    this.destroy();
  };

  /**
   * The sheets are square and larger than the view, because they are rotated
   * into the wind and a viewport-sized quad would show its corners. Resizing is
   * rationed: the camera's zoom eases every frame, and nudging the geometry by a
   * pixel a frame is pure waste.
   */
  private resize(viewWidth: number, viewHeight: number): void {
    const wanted = sheetSizeFor(viewWidth, viewHeight);
    if (Math.abs(wanted - this.sheetSize) < RESIZE_SLACK) {
      return;
    }
    this.sheetSize = wanted;
    for (const sheet of this.sheets) {
      sheet.setSize(wanted, wanted);
    }
  }

  /**
   * Strikes new splashes along whatever the camera can see of the roof lines.
   * Surfaces are drawn from by how much of them is on screen, so a sliver of
   * roof is struck as often per foot as the whole street below it.
   */
  private strike(view: Phaser.Geom.Rectangle, seconds: number): void {
    const right = view.x + view.width;
    const lit: { left: number; span: number; y: number }[] = [];
    let total = 0;

    for (const surface of this.surfaces) {
      if (surface.y < view.y - 8 || surface.y > view.y + view.height) {
        continue;
      }
      const from = Math.max(surface.left, view.x);
      const span = Math.min(surface.right, right) - from;
      if (span <= 0) {
        continue;
      }
      total += span;
      lit.push({ left: from, span, y: surface.y });
    }

    if (total === 0) {
      this.splashDebt = 0;
      return;
    }

    this.splashDebt += SPLASH_RATE * this.weather.intensity * seconds;
    while (this.splashDebt >= 1) {
      this.splashDebt -= 1;
      if (this.splashes.length >= MAX_SPLASHES) {
        this.splashDebt = 0;
        return;
      }
      let pick = Math.random() * total;
      let surface = lit[lit.length - 1];
      for (const candidate of lit) {
        pick -= candidate.span;
        if (pick <= 0) {
          surface = candidate;
          break;
        }
      }
      this.splashes.push({
        x: surface.left + Math.random() * surface.span,
        // Off the line by a pixel or two: a perfectly straight row of splashes
        // reads as a drawn seam rather than as water.
        y: surface.y + Math.random() * 4 - 1,
        age: 0,
        life: 0.24 + Math.random() * 0.16,
        width: 12 + Math.random() * 14,
      });
    }
  }

  /**
   * One flattening ring per splash, plus the two flecks it throws off.
   *
   * Rectangles, not ellipses: Phaser walks a `Graphics` buffer in JavaScript on
   * every render, and a filled ellipse costs it thirty-odd triangles against a
   * rectangle's two. At three pixels tall nothing on screen can tell them apart,
   * and the whole pool comes to a couple of dozen triangles a frame.
   */
  private drawSpray(seconds: number): void {
    this.spray.clear();
    let live = 0;

    for (const splash of this.splashes) {
      splash.age += seconds;
      if (splash.age >= splash.life) {
        continue;
      }

      const t = splash.age / splash.life;
      const fade = (1 - t) * 0.5 * this.weather.intensity;
      const width = splash.width * (0.35 + t * 0.9);

      this.spray.fillStyle(SPLASH_COLOR, fade);
      this.spray.fillRect(splash.x - width / 2, splash.y - 3, width, 2.4);

      // A fleck out of each side, thrown up and falling back.
      const lift = 10 * Math.sin(Math.PI * clamp(t * 1.2, 0, 1));
      this.spray.fillRect(splash.x - width * 0.44, splash.y - lift, 2, 2);
      this.spray.fillRect(splash.x + width * 0.44, splash.y - lift * 0.8, 2, 2);

      this.splashes[live] = splash;
      live += 1;
    }

    this.splashes.length = live;
  }
}
