import { LEVELS } from "../../game/content/levels";
import type { GameState } from "../../game/simulation/state";

export class Hud {
  private readonly root: HTMLElement;

  public constructor(root: HTMLElement) {
    this.root = root;
  }

  public render(state: GameState): void {
    const healthPercent = Math.round(
      (state.player.health / state.player.maxHealth) * 100,
    );
    const level = LEVELS[state.progression.levelIndex];
    const remainingEnemies = state.enemies.filter(
      (enemy) => enemy.health > 0,
    ).length;
    const levelDots = LEVELS.map(
      (_, index) =>
        `<span class="level-dot${index <= state.progression.levelIndex ? " is-active" : ""}"></span>`,
    ).join("");

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
          <div class="objective">Health ${state.player.health}/${state.player.maxHealth} · ${remainingEnemies} threats remain</div>
        </section>
        <section class="level-cluster" aria-label="Current level">
          <span class="level-kicker">Level ${state.progression.levelIndex + 1} / ${LEVELS.length}</span>
          <strong class="level-name">${level.name}</strong>
          <span class="level-subtitle">${level.subtitle}</span>
          <span class="level-dots" aria-hidden="true">${levelDots}</span>
        </section>
      </div>
      <aside class="hint-chip">
        <span>A/D</span> move · <span>W/S</span> lane · <span>Space</span> jump · <span>E</span> swing · <span>J</span> strike · <span>Q/K</span> gadget · <span>Shift</span> glide
      </aside>
      <div class="message">${state.player.message}</div>
    `;
  }
}
