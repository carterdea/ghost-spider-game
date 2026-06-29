import type { GameState } from "../../game/simulation/state";

export class Hud {
  private readonly root: HTMLElement;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public render(state: GameState): void {
    const healthPercent = Math.round((state.player.health / state.player.maxHealth) * 100);

    this.root.innerHTML = `
      <div class="hud-top">
        <section class="status-cluster" aria-label="Player status">
          <div class="hero-row">
            <span class="hero-name">Ghost Pirouette</span>
            <span>${state.player.score} pts</span>
          </div>
          <div class="bar" aria-label="Health">
            <div class="bar-fill" style="width: ${healthPercent}%"></div>
          </div>
          <div class="objective">Health ${state.player.health}/${state.player.maxHealth}</div>
        </section>
        <aside class="hint-chip">
          A/D move · Space jump · W swing web · S drop · J kick/web strike · R restart
        </aside>
      </div>
      <div class="message">${state.player.message}</div>
    `;
  }
}
