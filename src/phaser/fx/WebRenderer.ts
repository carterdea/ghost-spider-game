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

/**
 * How fast a thrown line travels, in px/s, and the window that speed is allowed
 * to land in. A fixed duration made a short snatch crawl and a long throw across
 * the street teleport; the line reads as thrown when it keeps one speed.
 */
const THWIP_SPEED = 4600;
const THWIP_MIN_MS = 70;
const THWIP_MAX_MS = 165;

/** How long the knot flares after a catch. */
const FLARE_MS = 220;

/**
 * Size of the knot's flare, as a multiple of its resting radius. A launch off a
 * roof is a planted, deliberate throw and lands hard; a catch taken in open air
 * mid-swing is a snatch, and flaring it as brightly turned every arc into a
 * string of flashes.
 */
const SURFACE_FLARE = 1.35;
const AIR_FLARE = 0.6;

/** Twist across a fully slack line, in px per px of span, and its ceiling. */
const BRAID_PER_PX = 0.008;
const BRAID_MAX = 2.2;

const SPLAT_LIFE = 1050;
const MAX_SPLATS = 14;

const LINE_DEPTH = 20;

/**
 * Patches sit above the platforms they are stuck to (6) and below the enemy
 * wind-ups (7) and the hero (8). Drawn with the line, at 20, a glob's web
 * covered the very telegraph the player has to read to dodge the next shot.
 */
const SPLAT_DEPTH = 6.5;

interface Splat {
  x: number;
  y: number;
  radius: number;
  seed: number;
  createdAt: number;
}

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

/** How long a line takes to reach an anchor `span` px away, inside its window. */
const thwipMsFor = (span: number): number =>
  Math.min(THWIP_MAX_MS, Math.max(THWIP_MIN_MS, (span / THWIP_SPEED) * 1000));

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
  /** Splats own a layer of their own so they never sit over a telegraph. */
  private readonly patches: Phaser.GameObjects.Graphics;
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
  private bow = 0;
  private span = 0;
  private anchorSeed = 0;
  private attachedAt = Number.NEGATIVE_INFINITY;
  private thwipMs = THWIP_MIN_MS;
  private flare = AIR_FLARE;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.live = scene.add.graphics().setDepth(LINE_DEPTH);
    this.patches = scene.add.graphics().setDepth(SPLAT_DEPTH);
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

  /**
   * How far the live line is bowing, in px. Zero is a rope under load, and it
   * goes there the instant the slack runs out, which is the snap the player
   * reads a swing off.
   */
  public get sag(): number {
    return this.bow;
  }

  /** Ties the glow to the district, so webbing sits inside the art direction. */
  public setAccent(accent: string): void {
    this.accent = parseAccent(accent, this.accent);
  }

  /**
   * The line to draw this frame.
   *
   * `ropeLength` is the length the solver is holding and `body` is the position
   * it measures that length from — the hero's centre, not the fist the line is
   * drawn from. The difference between the two is the slack that becomes the
   * bow, so it has to be the solver's own pair: measuring the rope from the fist
   * instead would leave a hand's width of phantom slack bowing a taut line.
   *
   * Left out, the line is drawn taut.
   */
  public drawLine(
    anchor: Vec2,
    hand: Vec2,
    ropeLength = 0,
    body: Vec2 = hand,
  ): void {
    this.attached = true;
    this.anchorX = anchor.x;
    this.anchorY = anchor.y;
    this.handX = hand.x;
    this.handY = hand.y;
    this.span = Math.hypot(hand.x - anchor.x, hand.y - anchor.y);
    this.bow = sagFor(
      ropeLength - Math.hypot(body.x - anchor.x, body.y - anchor.y),
      this.span,
    );
  }

  public clearLine(): void {
    this.attached = false;
  }

  /**
   * A web just caught: the streak that threw it, and the knot it landed in.
   * `fromSurface` is a launch off a roof or the street rather than a catch taken
   * in open air, and it is the harder landing of the two.
   */
  public launch(anchor: Vec2, hand: Vec2, fromSurface = false): void {
    this.attachedAt = this.scene.time.now;
    this.anchorSeed = Math.floor(Math.random() * 1024);
    this.flare = fromSurface ? SURFACE_FLARE : AIR_FLARE;
    this.thwipMs = thwipMsFor(Math.hypot(hand.x - anchor.x, hand.y - anchor.y));
    this.drawLine(anchor, hand);
  }

  /** Cuts the current line loose so it snaps away instead of vanishing. */
  public release(anchor: Vec2, hand: Vec2): void {
    this.clearLine();
    this.cut.cut(anchor.x, anchor.y, hand.x, hand.y);
  }

  /**
   * A glob or a net landed where it was fired. `power` runs 0 for a graze to 1
   * for a full net, and is the size of the patch it leaves.
   */
  public splat(at: Vec2, power: number): void {
    if (this.splats.length >= MAX_SPLATS) {
      this.splats.shift();
    }
    this.splats.push({
      x: at.x,
      y: at.y,
      radius: 13 + clamp01(power) * 17,
      seed: Math.floor(Math.random() * 1024),
      createdAt: this.scene.time.now,
    });
  }

  public update(): void {
    const now = this.scene.time.now;
    this.live.clear();
    this.patches.clear();
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
    this.patches.clear();
    this.cut.clear();
  }

  public destroy(): void {
    this.reset();
    this.live.destroy();
    this.patches.destroy();
  }

  private drawLiveLine(now: number): void {
    if (!this.attached) {
      return;
    }

    const since = now - this.attachedAt;
    const thrown = clamp01(since / this.thwipMs);

    this.style.glow = this.accent;
    this.style.alpha = LINE_ALPHA;
    this.style.width = LINE_WIDTH;

    if (thrown < 1) {
      this.drawThwip(thrown);
      return;
    }

    // Loose webbing crawls and twists; a line under load pulls dead straight,
    // so the braid dies with the slack and taut reads as taut.
    //
    // The twist is a fraction of the strand's own length, not a fixed width:
    // the same amplitude that reads as a lazy crawl down a line across the
    // street reads as a lightning bolt on the short one a mid-swing snatch
    // leaves, because the wavelength shrinks with the span and the amplitude
    // did not.
    const slackness = clamp01(this.bow / 40);
    traceStrand(
      this.anchorX,
      this.anchorY,
      this.handX,
      this.handY,
      this.bow,
      slackness * Math.min(BRAID_MAX, this.span * BRAID_PER_PX),
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
      1 + flare * flare * this.flare,
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
        this.patches,
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
