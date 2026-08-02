import type Phaser from "phaser";
import { colors } from "../../game/assets/manifest";
import type { Vec2 } from "../../game/simulation/physics/vector";

interface FadingWeb {
  graphic: Phaser.GameObjects.Graphics;
  anchor: Vec2;
  hand: Vec2;
  sway: number;
  drop: number;
  createdAt: number;
}

const FADE_DURATION = 760;

const randomBetween = (min: number, max: number): number =>
  min + Math.random() * (max - min);

/** Draws the live web-line and the cut strands that flutter down behind it. */
export class WebRenderer {
  private readonly scene: Phaser.Scene;
  private readonly line: Phaser.GameObjects.Graphics;
  private readonly fading: FadingWeb[] = [];

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.line = scene.add.graphics().setDepth(20);
  }

  public drawLine(anchor: Vec2, hand: Vec2): void {
    this.line.clear();
    this.drawStrand(this.line, anchor.x, anchor.y, hand.x, hand.y, 0.88, 3);
  }

  public clearLine(): void {
    this.line.clear();
  }

  /** Cuts the current line loose so it falls away instead of vanishing. */
  public release(anchor: Vec2, hand: Vec2): void {
    this.clearLine();
    const graphic = this.scene.add.graphics().setDepth(19);
    this.drawStrand(graphic, anchor.x, anchor.y, hand.x, hand.y, 0.72, 0);
    this.fading.push({
      graphic,
      anchor: { ...anchor },
      hand: { ...hand },
      sway: randomBetween(-14, 14),
      drop: randomBetween(54, 82),
      createdAt: this.scene.time.now,
    });
  }

  /**
   * Advances every cut strand. Runs each frame, so it compacts the list in
   * place and passes plain coordinates around rather than minting arrays and
   * point objects per web.
   */
  public update(): void {
    let live = 0;

    for (const web of this.fading) {
      const progress = (this.scene.time.now - web.createdAt) / FADE_DURATION;
      if (progress >= 1) {
        web.graphic.destroy();
        continue;
      }

      const fall = progress * progress * 96;
      const sway = Math.sin(progress * Math.PI) * web.sway;
      web.graphic.clear();
      this.drawStrand(
        web.graphic,
        web.anchor.x + sway * 0.4,
        web.anchor.y + fall * 0.4,
        web.hand.x + sway,
        web.hand.y + fall + web.drop * progress,
        (1 - progress) * 0.72,
        0,
      );
      this.fading[live] = web;
      live += 1;
    }

    this.fading.length = live;
  }

  /** Drops everything drawn for the level being left; the renderer lives on. */
  public reset(): void {
    this.clearLine();
    for (const web of this.fading) {
      web.graphic.destroy();
    }
    this.fading.length = 0;
  }

  public destroy(): void {
    this.reset();
    this.line.destroy();
  }

  private drawStrand(
    graphic: Phaser.GameObjects.Graphics,
    anchorX: number,
    anchorY: number,
    handX: number,
    handY: number,
    alpha: number,
    seed: number,
  ): void {
    const dx = handX - anchorX;
    const dy = handY - anchorY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;
    const wobble = Math.sin(this.scene.time.now * 0.006 + seed) * 8;

    graphic.lineStyle(3, colors.web, alpha);
    graphic.beginPath();
    graphic.moveTo(anchorX, anchorY);
    graphic.lineTo(
      (anchorX + handX) / 2 + normalX * wobble,
      (anchorY + handY) / 2 + normalY * wobble,
    );
    graphic.lineTo(handX, handY);
    graphic.strokePath();

    graphic.lineStyle(1, 0xbff7ff, alpha * 0.82);
    for (let step = 1; step <= 4; step += 1) {
      const t = step / 5;
      const taper = 1 - Math.abs(0.5 - t);
      const x = anchorX + dx * t + normalX * wobble * taper;
      const y = anchorY + dy * t + normalY * wobble * taper;
      const branch = 10 + ((step + seed) % 3) * 5;
      const side = step % 2 === 0 ? 1 : -1;
      graphic.lineBetween(
        x,
        y,
        x + normalX * branch * side,
        y + normalY * branch * side,
      );
      graphic.lineBetween(x, y, x - dx * 0.035, y - dy * 0.035);
    }

    graphic.strokeCircle(handX, handY, 6);
  }
}
