import { LEVELS, type LevelDefinition } from "../../game/content/levels";
import type {
  GadgetKind,
  GameState,
  RunStatus,
} from "../../game/simulation/state";
import { livingEnemies } from "../../game/simulation/state";
import { getLevelByIndex } from "../../game/simulation/systems/progression";
import { buildHud, type HudNodes } from "./dom";

const BANNERS: Record<RunStatus, { title: string; hint: string } | null> = {
  playing: null,
  cleared: {
    title: "Skyline Secured",
    hint: "Every district is clear. Press R to run it again.",
  },
  knockedOut: {
    title: "Knocked Out",
    hint: "The city needs you. Press R to restart.",
  },
};

/** `""` is the freshly built DOM, where no gadget chip is highlighted yet. */
type SelectedGadget = GadgetKind | "";

/** Every value the HUD paints, so an unchanged frame can skip the DOM entirely. */
interface Snapshot {
  score: string;
  health: number;
  maxHealth: number;
  threats: string;
  kicker: string;
  levelName: string;
  subtitle: string;
  accent: string;
  dots: string;
  gadget: SelectedGadget;
  message: string;
  status: RunStatus;
}

/** Mirrors the freshly built DOM, so the first render fills in every blank. */
const BLANK: Snapshot = {
  score: "",
  health: -1,
  maxHealth: -1,
  threats: "",
  kicker: "",
  levelName: "",
  subtitle: "",
  accent: "",
  dots: "",
  gadget: "",
  message: "",
  status: "playing",
};

const threatLabel = (alive: number): string => {
  if (alive <= 0) {
    return "District clear";
  }
  return alive === 1 ? "1 threat remains" : `${alive} threats remain`;
};

const dotClass = (visited: boolean, current: boolean): string =>
  `level-dot${visited ? " is-active" : ""}${current ? " is-current" : ""}`;

/** A knocked-out hero always sees the banner, whatever the run status says. */
const bannerStatus = (state: GameState): RunStatus =>
  state.player.health <= 0 ? "knockedOut" : state.progression.status;

const takeSnapshot = (state: GameState, level: LevelDefinition): Snapshot => {
  const { player, progression } = state;
  return {
    score: `${player.score} pts`,
    health: player.health,
    maxHealth: player.maxHealth,
    threats: threatLabel(livingEnemies(state).length),
    kicker: `Level ${progression.levelIndex + 1} / ${LEVELS.length}`,
    levelName: level.name,
    subtitle: level.subtitle,
    accent: level.accent,
    dots: `${progression.levelIndex}|${progression.visitedLevelIds.join(",")}`,
    gadget: player.gadget,
    message: player.message,
    status: bannerStatus(state),
  };
};

/**
 * Neon-noir status overlay. The DOM is built once; `render` runs every frame
 * and writes only the nodes whose values actually changed, so a steady frame
 * touches the DOM zero times.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly nodes: HudNodes;
  private last: Snapshot = BLANK;

  public constructor(root: HTMLElement) {
    this.root = root;
    this.nodes = buildHud(root);
  }

  public render(state: GameState): void {
    const level = getLevelByIndex(state.progression.levelIndex);
    const next = takeSnapshot(state, level);
    const last = this.last;
    const nodes = this.nodes;

    if (next.score !== last.score) nodes.score.textContent = next.score;
    if (next.health !== last.health || next.maxHealth !== last.maxHealth) {
      this.writeHealth(next.health, next.maxHealth);
    }
    if (next.threats !== last.threats) nodes.threats.textContent = next.threats;
    if (next.kicker !== last.kicker) nodes.kicker.textContent = next.kicker;
    if (next.levelName !== last.levelName) {
      nodes.levelName.textContent = next.levelName;
    }
    if (next.subtitle !== last.subtitle) {
      nodes.subtitle.textContent = next.subtitle;
    }
    if (next.accent !== last.accent) {
      this.root.style.setProperty("--level-accent", next.accent);
    }
    if (next.dots !== last.dots) this.writeDots(state.progression);
    if (next.gadget !== last.gadget) this.writeGadget(last.gadget, next.gadget);
    if (next.message !== last.message) {
      nodes.message.textContent = next.message;
    }
    if (next.status !== last.status) this.writeStatus(next.status);

    this.last = next;
  }

  private writeHealth(health: number, maxHealth: number): void {
    const ratio = maxHealth > 0 ? health / maxHealth : 0;
    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    this.nodes.barFill.style.width = `${percent}%`;
    this.nodes.bar.setAttribute("aria-valuenow", String(health));
    this.nodes.bar.setAttribute("aria-valuemax", String(maxHealth));
    this.nodes.health.textContent = `Health ${health}/${maxHealth}`;
  }

  private writeDots(progression: GameState["progression"]): void {
    this.nodes.dots.forEach((dot, index) => {
      const visited =
        index <= progression.levelIndex ||
        progression.visitedLevelIds.includes(LEVELS[index].id);
      const className = dotClass(visited, index === progression.levelIndex);
      if (dot.className !== className) dot.className = className;
    });
  }

  private writeGadget(previous: SelectedGadget, active: SelectedGadget): void {
    if (previous !== "") {
      this.nodes.gadgets.get(previous)?.classList.remove("is-active");
    }
    if (active !== "") {
      this.nodes.gadgets.get(active)?.classList.add("is-active");
    }
  }

  private writeStatus(status: RunStatus): void {
    const banner = BANNERS[status];
    this.nodes.banner.className =
      banner === null ? "run-banner" : `run-banner is-${status}`;
    this.nodes.banner.hidden = banner === null;
    this.nodes.bannerTitle.textContent = banner?.title ?? "";
    this.nodes.bannerHint.textContent = banner?.hint ?? "";
  }
}
