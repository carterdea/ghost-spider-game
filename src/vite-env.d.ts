/// <reference types="vite/client" />

import type Phaser from "phaser";

declare global {
  interface Window {
    /** Present only in dev builds; used by automated playtests. */
    __ghostSpider?: Phaser.Game;
  }
}
