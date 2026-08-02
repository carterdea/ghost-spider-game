import Phaser from "phaser";
import { GameScene } from "./phaser/scenes/GameScene";
import "./styles.css";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
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
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);

// Dev-only handle so automated playtests can read live scene state.
if (import.meta.env.DEV) {
  window.__ghostSpider = game;
}
