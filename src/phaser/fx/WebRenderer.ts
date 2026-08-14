import type Phaser from "phaser";
import { colors } from "../../game/assets/manifest";
import type { Vec2 } from "../../game/simulation/physics/vector";
import { CutStrands } from "./webCut";
import { drawAnchorSpray, drawSplat } from "./webSplat";
import {
  type StrandStyle,
  sagFor,
  strokeStrand,
  traceStrand,
} from "./webStrand";

/**
 * Every strand of webbing on screen: the line the hero is hanging from, the
 * thwip that threw it, the knot holding it to the world, the patches a glob or
 * a net leaves, and the strands that snap away when a line is let go.
 *
 * The live layer is one `Graphics` that is cleared and redrawn every frame, so
 * `drawLine` only records what to draw and `update` does the drawing. Cut
 * strands own their own graphic because they outlive the frame that made them.
 *
 * Everything animates against the scene clock rather than a frame count, so the
 * look is identical at any refresh rate, and nothing here owns a tween or a
 * timer for a level change to leak.
 */

/** Falls back to Midtown's teal until the scene names the district's accent. */
const DEFAULT_ACCENT = 0x55e8f0;

const HIGHLIGHT = 0xffffff;

/** Width of the live line where it leaves the fist, in px. */
const LINE_WIDTH = 3.4;

const LINE_ALPHA = 0.9;

/** How far the launch streak flies before the line itself takes over. */
const THWIP_MS = 120;

/** How long the knot flares after a catch. */
const FLARE_MS = 220;

const SPLAT_LIFE = 1050;
const MAX_SPLATS = 14;

interface Splat {
  x: number;
  y: number;
  radius: number;
  seed: number;
  createdAt: number;
}

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/** `#rrggbb` as Phaser wants it. Anything unreadable keeps the current accent. */
const parseAccent = (css: string, fallback: number): number => {
  const digits = css.startsWith("#") ? css.slice(1) : css;
  if (digits.length !== 6) {
    return fallback;
  }
  const parsed = Number.parseInt(digits, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class WebRenderer {
  private readonly scene: Phaser.Scene;
  private readonly live: Phaser.GameObjects.Graphics;
  private readonly cut: CutStrands;
  private readonly splats: Splat[] = [];

  /** One reused style record: this is written and read every single frame. */
  private readonly style: StrandStyle = {
    core: colors.web,
    glow: DEFAULT_ACCENT,
    highlight: HIGHLIGHT,
    alpha: LINE_ALPHA,
    width: LINE_WIDTH,
  };

  private accent = DEFAULT_ACCENT;

  /** The line the hero is hanging from, held as plain numbers to stay alloc-free. */
  private attached = false;
  private anchorX = 0;
  private anchorY = 0;
  private handX = 0;
  private handY = 0;
  private sag = 0;
  private anchorSeed = 0;
  private attachedAt = Number.NEGATIVE_INFINITY;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.live = scene.add.graphics().setDepth(20);
    this.cut = new CutStrands(scene, this.style);
  }

  /** Patches of webbing still stuck to the world. */
  public get liveSplats(): number {
    return this.splats.length;
  }

  /** Strands still snapping away from a line that was let go. */
  public get liveStrands(): number {
    return this.cut.liveCount;
  }

  /** Ties the glow to the district, so webbing sits inside the art direction. */
  public setAccent(accent: string): void {
    this.accent = parseAccent(accent, this.accent);
  }

  /**
   * The line to draw this frame. `ropeLength` and `reach` are the solver's own
   * numbers — the length it is holding, and how far the hero actually is from
   * the anchor — and their difference is the slack that becomes the bow. Left
   * out, the line is drawn taut.
   */
  public drawLine(anchor: Vec2, hand: Vec2, ropeLength = 0, reach = 0): void {
    this.attached = true;
    this.anchorX = anchor.x;
    this.anchorY = anchor.y;
    this.handX = hand.x;
    this.handY = hand.y;
    this.sag = sagFor(
      ropeLength - reach,
      Math.hypot(hand.x - anchor.x, hand.y - anchor.y),
    );
  }

  public clearLine(): void {
    this.attached = false;
  }

  /** A web just caught: the streak that threw it, and the knot it landed in. */
  public launch(anchor: Vec2, hand: Vec2): void {
    this.attachedAt = this.scene.time.now;
    this.anchorSeed = Math.floor(Math.random() * 1024);
    this.drawLine(anchor, hand);
  }

  /** Cuts the current line loose so it snaps away instead of vanishing. */
  public release(anchor: Vec2, hand: Vec2): void {
    this.clearLine();
    this.cut.cut(anchor.x, anchor.y, hand.x, hand.y);
  }

  /** A glob or a net landed. `power` runs 0 for a graze to 1 for a full net. */
  public splat(x: number, y: number, power: number): void {
    if (this.splats.length >= MAX_SPLATS) {
      this.splats.shift();
    }
    this.splats.push({
      x,
      y,
      radius: 13 + clamp01(power) * 17,
      seed: Math.floor(Math.random() * 1024),
      createdAt: this.scene.time.now,
    });
  }

  public update(): void {
    const now = this.scene.time.now;
    this.live.clear();
    this.drawSplats(now);
    this.drawLiveLine(now);
    this.cut.update(now, this.accent);
  }

  /** Drops everything drawn for the level being left; the renderer lives on. */
  public reset(): void {
    this.clearLine();
    this.attachedAt = Number.NEGATIVE_INFINITY;
    this.splats.length = 0;
    this.live.clear();
    this.cut.clear();
  }

  public destroy(): void {
    this.reset();
    this.live.destroy();
  }

  private drawLiveLine(now: number): void {
    if (!this.attached) {
      return;
    }

    const since = now - this.attachedAt;
    const thrown = clamp01(since / THWIP_MS);

    this.style.glow = this.accent;
    this.style.alpha = LINE_ALPHA;
    this.style.width = LINE_WIDTH;

    if (thrown < 1) {
      this.drawThwip(thrown);
      return;
    }

    // Loose webbing crawls and twists; a line under load pulls dead straight,
    // so the braid dies with the slack and taut reads as taut.
    const slackness = clamp01(this.sag / 40);
    traceStrand(
      this.anchorX,
      this.anchorY,
      this.handX,
      this.handY,
      this.sag,
      slackness * 3.2,
      now * 0.004,
    );
    strokeStrand(this.live, this.style);
    this.drawKnot(since);
  }

  /** The knot flares as the web lands, then settles to its resting size. */
  private drawKnot(since: number): void {
    const flare = 1 - clamp01(since / FLARE_MS);
    drawAnchorSpray(
      this.live,
      this.anchorX,
      this.anchorY,
      this.anchorSeed,
      colors.web,
      this.accent,
      LINE_ALPHA,
      1 + flare * flare * 1.1,
    );
  }

  /** The line in flight: a bright head with the strand streaming behind it. */
  private drawThwip(thrown: number): void {
    const head = 1 - (1 - thrown) ** 2;
    const tail = Math.max(0, head - 0.55);
    const dx = this.anchorX - this.handX;
    const dy = this.anchorY - this.handY;

    traceStrand(
      this.handX + dx * tail,
      this.handY + dy * tail,
      this.handX + dx * head,
      this.handY + dy * head,
      0,
      0,
      0,
    );
    this.style.width = LINE_WIDTH * 0.8;
    strokeStrand(this.live, this.style);

    this.live.fillStyle(HIGHLIGHT, 1 - thrown * 0.5);
    this.live.fillCircle(this.handX + dx * head, this.handY + dy * head, 3.4);
  }

  private drawSplats(now: number): void {
    if (this.splats.length === 0) {
      return;
    }

    let live = 0;
    for (const splat of this.splats) {
      const progress = (now - splat.createdAt) / SPLAT_LIFE;
      if (progress >= 1) {
        continue;
      }

      drawSplat(
        this.live,
        splat.x,
        splat.y,
        splat.radius,
        splat.seed,
        1 - (1 - progress) ** 3,
        // Holds its brightness, then goes all at once as it dries out.
        Math.min(1, (1 - progress) * 2.2),
        colors.web,
        this.accent,
      );

      this.splats[live] = splat;
      live += 1;
    }

    this.splats.length = live;
  }
}
