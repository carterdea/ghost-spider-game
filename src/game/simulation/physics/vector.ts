export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned box in world space, anchored at its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const length = (v: Vec2): number => Math.hypot(v.x, v.y);

export const distance = (a: Vec2, b: Vec2): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const scale = (v: Vec2, factor: number): Vec2 => ({
  x: v.x * factor,
  y: v.y * factor,
});

export const add = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const subtract = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

/** Unit vector, or a zero vector when the input has no direction. */
export const normalize = (v: Vec2): Vec2 => {
  const magnitude = length(v);
  return magnitude === 0 ? { x: 0, y: 0 } : scale(v, 1 / magnitude);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const rectTop = (rect: Rect): number => rect.y;
export const rectBottom = (rect: Rect): number => rect.y + rect.height;
export const rectLeft = (rect: Rect): number => rect.x;
export const rectRight = (rect: Rect): number => rect.x + rect.width;

export const rectCenter = (rect: Rect): Vec2 => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});
