import type Phaser from "phaser";
import { colors } from "../../game/assets/manifest";
import type { BossIntent, BossPhaseTuning } from "../../game/simulation/ai";
import { clamp, type Vec2 } from "../../game/simulation/physics/vector";

/** Everything the boss's tells need, gathered by the director each frame. */
export interface BossOverlayInput {
  position: Vec2;
  /** Half the sprite's on-screen width. Every ring is sized off it. */
  radius: number;
  /** Half the sprite's on-screen height, so the bar clears the hull. */
  halfHeight: number;
  player: Vec2;
  intent: BossIntent;
  phase: BossPhaseTuning;
  healthFraction: number;
  /** Health fractions where phases 2 and 3 begin, drawn as bar ticks. */
  thresholds: readonly [number, number];
  /** The brain's ever-advancing clock, in seconds. Drives every pulse. */
  clock: number;
}

const BAR_WIDTH = 300;
const BAR_HEIGHT = 11;
const BAR_LIFT = 54;
/** Seconds one ring takes to travel out. Shared by every pulsing ring. */
const RING_PERIOD = 0.55;

const PHASE_ACCENT = [colors.balletTeal, colors.wingLavender, colors.danger];

const accentFor = (phase: number): number =>
  PHASE_ACCENT[clamp(phase - 1, 0, PHASE_ACCENT.length - 1)];

/** A health bar that also shows where the next phase begins. */
const drawHealthBar = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
): void => {
  const left = input.position.x - BAR_WIDTH / 2;
  const top = input.position.y - input.halfHeight - BAR_LIFT;
  const filled = clamp(input.healthFraction, 0, 1) * BAR_WIDTH;

  overlay.fillStyle(0x0b0e17, 0.72);
  overlay.fillRect(left - 3, top - 3, BAR_WIDTH + 6, BAR_HEIGHT + 6);
  overlay.fillStyle(accentFor(input.intent.phase), 0.95);
  overlay.fillRect(left, top, filled, BAR_HEIGHT);

  overlay.lineStyle(2, colors.ghostWhite, 0.55);
  overlay.strokeRect(left - 3, top - 3, BAR_WIDTH + 6, BAR_HEIGHT + 6);
  for (const threshold of input.thresholds) {
    const tick = left + BAR_WIDTH * threshold;
    overlay.lineBetween(tick, top, tick, top + BAR_HEIGHT);
  }
};

/** Rings travelling outward. The louder the boss is, the more of them there are. */
const drawPulse = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
  tint: number,
  rings: number,
): void => {
  for (let ring = 0; ring < rings; ring += 1) {
    const travel = (((input.clock / RING_PERIOD + ring / rings) % 1) + 1) % 1;
    overlay.lineStyle(3, tint, 0.7 * (1 - travel));
    overlay.strokeCircle(
      input.position.x,
      input.position.y,
      input.radius * (0.7 + travel * 1.5),
    );
  }
};

const headingToPlayer = (input: BossOverlayInput): number =>
  Math.atan2(
    input.player.y - input.position.y,
    input.player.x - input.position.x,
  );

const reach = (input: BossOverlayInput): number =>
  Math.hypot(
    input.player.x - input.position.x,
    input.player.y - input.position.y,
  );

/** The volley fan, drawn at its true spread and closing on the player. */
const drawVolleyTell = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
  amount: number,
): void => {
  const centre = headingToPlayer(input);
  const count = Math.max(1, input.phase.volleyShots);
  const step = count > 1 ? input.phase.volleySpread / (count - 1) : 0;
  const first = centre - (step * (count - 1)) / 2;
  const length = reach(input) * amount;

  overlay.lineStyle(2, colors.danger, 0.25 + 0.65 * amount);
  for (let shot = 0; shot < count; shot += 1) {
    const angle = first + shot * step;
    overlay.lineBetween(
      input.position.x,
      input.position.y,
      input.position.x + Math.cos(angle) * length,
      input.position.y + Math.sin(angle) * length,
    );
  }
};

/** The slam lane: one thick line, drawn well past the player it is aimed at. */
const drawSlamTell = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
  amount: number,
): void => {
  const heading = headingToPlayer(input);
  const length = reach(input) + 420;

  overlay.lineStyle(4 + 6 * amount, colors.danger, 0.2 + 0.6 * amount);
  overlay.lineBetween(
    input.position.x,
    input.position.y,
    input.position.x + Math.cos(heading) * length,
    input.position.y + Math.sin(heading) * length,
  );
  overlay.lineStyle(2, colors.ghostWhite, 0.5 * amount);
  overlay.strokeCircle(
    input.position.x,
    input.position.y,
    input.radius * (1.9 - amount),
  );
};

/** The nova: a ring closing in, with a spoke for every lane about to open. */
const drawNovaTell = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
  amount: number,
  spokes: number,
): void => {
  const radius = input.radius * (2.6 - 1.4 * amount);
  overlay.lineStyle(3, colors.wingLavender, 0.3 + 0.6 * amount);
  overlay.strokeCircle(input.position.x, input.position.y, radius);

  for (let spoke = 0; spoke < spokes; spoke += 1) {
    const angle = (Math.PI * 2 * spoke) / spokes;
    overlay.lineBetween(
      input.position.x + Math.cos(angle) * radius,
      input.position.y + Math.sin(angle) * radius,
      input.position.x + Math.cos(angle) * (radius + 26 * amount),
      input.position.y + Math.sin(angle) * (radius + 26 * amount),
    );
  }
};

const drawTell = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
  novaSpokes: number,
): void => {
  const amount = clamp(input.intent.telegraph, 0, 1);
  switch (input.intent.telegraphKind) {
    case "volley":
      drawVolleyTell(overlay, input, amount);
      return;
    case "slam":
      drawSlamTell(overlay, input, amount);
      return;
    case "nova":
      drawNovaTell(overlay, input, amount, novaSpokes);
      return;
    case null:
      return;
  }
};

/**
 * Every boss tell, drawn onto the shared telegraph overlay. Creates nothing:
 * the caller clears the graphics each frame, so there is nothing to tear down.
 */
export const drawBossOverlay = (
  overlay: Phaser.GameObjects.Graphics,
  input: BossOverlayInput,
  novaSpokes: number,
): void => {
  const { state } = input.intent;

  // The hull outline, so a boss half off-screen still reads as a boss.
  overlay.lineStyle(2, accentFor(input.intent.phase), 0.3);
  overlay.strokeCircle(input.position.x, input.position.y, input.radius * 1.1);

  if (state === "shift") {
    drawPulse(overlay, input, colors.ghostWhite, 3);
  } else if (state === "wake") {
    drawPulse(overlay, input, accentFor(input.intent.phase), 2);
  } else if (input.intent.vulnerable) {
    drawPulse(overlay, input, colors.balletTeal, 1);
  }

  drawTell(overlay, input, novaSpokes);

  if (state !== "dormant") {
    drawHealthBar(overlay, input);
  }
};
