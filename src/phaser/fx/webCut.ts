import type Phaser from "phaser";
import { drawAnchorSpray } from "./webSplat";
import { type StrandStyle, strokeStrand, traceStrand } from "./webStrand";

/**
 * The strands left behind when a web is let go.
 *
 * A cut line does not simply fade: it snaps. The stored tension comes out as a
 * whip that rings through the strand and dies away while the free end falls,
 * which is what makes a release read as a release rather than as a hide.
 *
 * Each strand owns one `Graphics` and is destroyed exactly once, the frame it
 * finishes. `clear` drops the lot, so a level change leaves nothing updating.
 */

const FADE_DURATION = 760;

/** Live strands. A cut is cheap, but a rapid-fire player should not stack up. */
const MAX_STRANDS = 8;

/** Radians of ring-out across the fade: about four and a half oscillations. */
const WHIP_RATE = 28;

interface CutStrand {
  graphic: Phaser.GameObjects.Graphics;
  anchorX: number;
  anchorY: number;
  handX: number;
  handY: number;
  sway: number;
  drop: number;
  /** Amplitude of the snap-back, in px. */
  whip: number;
  seed: number;
  createdAt: number;
}

const randomBetween = (min: number, max: number): number =>
  min + Math.random() * (max - min);

export class CutStrands {
  private readonly scene: Phaser.Scene;
  private readonly strands: CutStrand[] = [];
  private readonly style: StrandStyle;

  public constructor(scene: Phaser.Scene, style: StrandStyle) {
    this.scene = scene;
    this.style = { ...style };
  }

  public get liveCount(): number {
    return this.strands.length;
  }

  /** Cuts a line loose from the anchor it was stuck to. */
  public cut(
    anchorX: number,
    anchorY: number,
    handX: number,
    handY: number,
  ): void {
    if (this.strands.length >= MAX_STRANDS) {
      this.retire(this.strands.shift());
    }

    this.strands.push({
      graphic: this.scene.add.graphics().setDepth(19),
      anchorX,
      anchorY,
      handX,
      handY,
      sway: randomBetween(-14, 14),
      drop: randomBetween(54, 82),
      whip: randomBetween(9, 17),
      seed: Math.floor(Math.random() * 1024),
      createdAt: this.scene.time.now,
    });
  }

  /**
   * Advances every cut strand. Runs each frame, so it compacts the list in
   * place and passes plain coordinates around rather than minting arrays and
   * point objects per web.
   */
  public update(now: number, glow: number): void {
    if (this.strands.length === 0) {
      return;
    }

    this.style.glow = glow;
    let live = 0;

    for (const web of this.strands) {
      const progress = (now - web.createdAt) / FADE_DURATION;
      if (progress >= 1) {
        this.retire(web);
        continue;
      }

      this.draw(web, progress);
      this.strands[live] = web;
      live += 1;
    }

    this.strands.length = live;
  }

  public clear(): void {
    for (const web of this.strands) {
      this.retire(web);
    }
    this.strands.length = 0;
  }

  private retire(web: CutStrand | undefined): void {
    web?.graphic.destroy();
  }

  private draw(web: CutStrand, progress: number): void {
    const remaining = 1 - progress;
    const fall = progress * progress * 96;
    const sway = Math.sin(progress * Math.PI) * web.sway;
    // The snap rings through the strand and is gone long before it lands.
    const whip = Math.sin(progress * WHIP_RATE) * web.whip * remaining ** 2;

    traceStrand(
      web.anchorX + sway * 0.4,
      web.anchorY + fall * 0.4,
      web.handX + sway,
      web.handY + fall + web.drop * progress,
      whip,
      1.4 + progress * 2.2,
      progress * 9,
    );

    this.style.alpha = remaining * 0.72;
    this.style.width = 3 * (1 - progress * 0.45);
    web.graphic.clear();
    strokeStrand(web.graphic, this.style);

    // The torn end keeps its knot for a beat, then that lets go too.
    if (progress < 0.45) {
      drawAnchorSpray(
        web.graphic,
        web.anchorX + sway * 0.4,
        web.anchorY + fall * 0.4,
        web.seed,
        this.style.core,
        this.style.glow,
        (1 - progress / 0.45) * 0.6,
        1,
      );
    }
  }
}
