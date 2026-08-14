/**
 * The rain, expressed as numbers only: how hard it falls over a given district,
 * how far the wind leans it, and how far each layer of the curtain scrolls in a
 * frame. Nothing here touches Phaser, so the awkward parts — frame-rate
 * independence, the rotation the camera adds — are tested as plain functions.
 */

import { clamp } from "../../game/simulation/physics/vector";

/** One sheet of the curtain. Three of them, drawn back to front, read as depth. */
export interface RainLayerSpec {
  /** A generated streak tile. Seamless in both axes, so it can scroll forever. */
  readonly texture: "rainFar" | "rainMid" | "rainNear";
  readonly depth: number;
  /** Pixels a drop falls per second, before intensity. */
  readonly fallSpeed: number;
  /**
   * How much of the camera's own motion the sheet takes on: 1 pins the rain to
   * the world (near, rushes past), 0 pins it to the screen (far, barely moves).
   */
  readonly parallax: number;
  /** Sheet opacity at full intensity. The streaks carry their own alpha too. */
  readonly alpha: number;
  /** Tile magnification. Bigger drops read as closer.  */
  readonly tileScale: number;
}

/**
 * Back to front. The near sheet is the only one drawn in front of the roofs, and
 * it is deliberately the faintest of the three: it crosses the hero's own space,
 * where an enemy wind-up has to stay the brightest thing on screen.
 */
export const RAIN_LAYERS: readonly RainLayerSpec[] = [
  {
    texture: "rainFar",
    depth: -5,
    fallSpeed: 620,
    parallax: 0.3,
    alpha: 0.5,
    tileScale: 0.8,
  },
  {
    texture: "rainMid",
    depth: -2.5,
    fallSpeed: 1080,
    parallax: 0.62,
    alpha: 0.44,
    tileScale: 1.15,
  },
  {
    texture: "rainNear",
    depth: 2.5,
    fallSpeed: 1720,
    parallax: 1,
    alpha: 0.3,
    tileScale: 1.7,
  },
];

/** Rooftop splashes, drawn in with the near sheet. */
export const SPLASH_DEPTH = 2.4;

/** Splashes struck per second across the whole viewport, at full intensity. */
export const SPLASH_RATE = 72;

/** Live splashes. A cap, not a target: one stalled frame must not cost the next. */
export const MAX_SPLASHES = 56;

export interface Weather {
  /** 0..1. Scales opacity, fall speed and how often rooftops are struck. */
  readonly intensity: number;
  /** Radians the curtain leans from vertical. Positive blows to the left. */
  readonly slant: number;
}

/**
 * Rain per district, read off what a level already declares rather than a new
 * field: the waterfront districts sit in open weather, midtown is sheltered by
 * its own towers, and the park pair get the softest of it so the greenery still
 * reads. The wind picks its side from the level id, so a district always blows
 * the same way.
 */
const BACKDROP_INTENSITY: Readonly<Record<string, number>> = {
  "environment-waterfront": 1,
  "environment-midtown": 0.76,
  "environment-park": 0.56,
};

const DEFAULT_INTENSITY = 0.76;

export const weatherFor = (level: {
  readonly id: string;
  readonly backdropKey: string;
}): Weather => {
  const intensity = BACKDROP_INTENSITY[level.backdropKey] ?? DEFAULT_INTENSITY;
  const direction = hash(level.id) % 2 === 0 ? 1 : -1;

  return { intensity, slant: direction * (0.1 + 0.14 * intensity) };
};

/** A stable, boring string hash. Only ever asked whether it is odd. */
const hash = (text: string): number => {
  let value = 7;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0;
  }
  return value;
};

/** Camera speed that has leaned the rain as far as it will ever lean. */
const LEAN_SPEED_RANGE = 1800;
const MAX_CAMERA_LEAN = 0.26;

/**
 * The angle the curtain is drawn at this frame. Two gusts of different periods
 * keep it from breathing on an obvious loop, and the camera's own speed leans it
 * further: rain the hero is flying through should streak past, not fall past.
 */
export const leanAt = (
  weather: Weather,
  elapsedMs: number,
  cameraVelocityX: number,
): number =>
  weather.slant +
  Math.sin(elapsedMs / 2600) * 0.05 +
  Math.sin(elapsedMs / 830) * 0.018 +
  clamp(cameraVelocityX / LEAN_SPEED_RANGE, -1, 1) * MAX_CAMERA_LEAN;

export interface TileScroll {
  readonly x: number;
  readonly y: number;
}

/**
 * How far a sheet's texture has to slide this frame, in tile units.
 *
 * The sheet is drawn as a quad pinned to the camera and rotated by `lean`, so
 * the camera's travel has to be rotated into the sheet's own frame before it can
 * be cancelled out — that cancellation is what makes a far sheet lag behind a
 * near one instead of the whole curtain moving as one piece.
 *
 * Everything scales linearly with `seconds`, so a frame drawn at 30fps and two
 * drawn at 60fps land in exactly the same place.
 */
export const rainScroll = (
  layer: RainLayerSpec,
  seconds: number,
  cameraDx: number,
  cameraDy: number,
  lean: number,
  intensity: number,
): TileScroll => {
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  const alongX = cameraDx * cos + cameraDy * sin;
  const alongY = -cameraDx * sin + cameraDy * cos;
  const fall = layer.fallSpeed * (0.7 + 0.3 * intensity) * seconds;

  return {
    x: (alongX * layer.parallax) / layer.tileScale,
    y: (alongY * layer.parallax - fall) / layer.tileScale,
  };
};
