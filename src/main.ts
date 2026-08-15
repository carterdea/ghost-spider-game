import Phaser from "phaser";
import { GameScene } from "./phaser/scenes/GameScene";
import { MIN_VIEW } from "./phaser/world/viewport";
import "./styles.css";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  // Only the first frame is this size: `RESIZE` hands the game the window as
  // soon as it boots, and every frame after that is whatever the window is.
  width: MIN_VIEW.width,
  height: MIN_VIEW.height,
  backgroundColor: "#101521",
  pixelArt: false,
  physics: {
    default: "arcade",
    arcade: {
      // The player sim applies its own gravity; only loose props fall by engine.
      gravity: { x: 0, y: 980 },
      debug: false,
    },
  },
  scale: {
    // The canvas is the window. FIT letterboxed every window that was not 16:9
    // — a fifth of the screen went to black bars at 1280x577 — so the framing
    // is the camera's job instead, and the camera can do it without waste:
    // see `frameZoom`.
    mode: Phaser.Scale.RESIZE,
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);

// Dev-only handle so automated playtests can read live scene state.
if (import.meta.env.DEV) {
  window.__ghostSpider = game;
}
