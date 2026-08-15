import { LEVELS } from "../../game/content/levels";
import {
  type GadgetKind,
  type GameState,
  type RunStatus,
  runSummary,
} from "../../game/simulation/state";
import { getLevelByIndex } from "../../game/simulation/systems/progression";
import {
  ARSENAL,
  GADGET_ORDER,
} from "../../game/simulation/systems/weapons/arsenal";
import { writeBanner } from "./banner";
import { buildHud, type HudNodes } from "./dom";

/** Charges carried, by weapon. The rack writes it; the HUD only reads it. */
export type GadgetCharges = Readonly<Record<GadgetKind, number>>;

/** `""` is the freshly built DOM, where no gadget chip is highlighted yet. */
type SelectedGadget = GadgetKind | "";

/** A chain only reads as a chain once there are two links in it. */
const MIN_SHOWN_CHAIN = 2;

/** Where the chip stops getting hotter, matching the multiplier's own cap. */
const MAX_HEAT = 7;

/**
 * `authored` separates a district cleared from one that never had patrols:
 * the warm-up district ships with none, and announcing "District clear" on its
 * first frame credits the player with something they have not done yet.
 */
const threatLabel = (alive: number, authored: number): string => {
  if (authored === 0) {
    return "No patrols here";
  }
  if (alive <= 0) {
    return "District clear";
  }
  return alive === 1 ? "1 threat remains" : `${alive} threats remain`;
};

const dotClass = (visited: boolean, current: boolean): string =>
  `level-dot${visited ? " is-active" : ""}${current ? " is-current" : ""}`;

/**
 * A knocked-out hero sees the banner on the frame their health reaches zero,
 * before the scene has posed them. A run that already ended some other way is
 * the exception: a cleared skyline is not taken back by a late blow, so the
 * status the run settled on wins.
 */
const bannerStatus = (state: GameState): RunStatus => {
  const { status } = state.progression;
  return state.player.health <= 0 && status === "playing"
    ? "knockedOut"
    : status;
};

/** Counted rather than filtered: this runs every frame and must not allocate. */
const countLivingEnemies = (state: GameState): number => {
  let alive = 0;
  for (const enemy of state.enemies) {
    if (enemy.health > 0) {
      alive += 1;
    }
  }
  return alive;
};

/**
 * Neon-noir status overlay. The DOM is built once; `render` runs every frame
 * and writes only the nodes whose values actually changed, so a steady frame
 * touches the DOM zero times.
 *
 * The comparison is against the raw values rather than a formatted snapshot, so
 * a steady frame builds no strings and allocates nothing either. `undefined`
 * means "never painted", which is what makes the first frame fill every blank.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly nodes: HudNodes;

  private score?: number;
  private health?: number;
  private maxHealth?: number;
  private threats?: number;
  private levelIndex?: number;
  private visitedCount?: number;
  private gadget: SelectedGadget = "";
  /** What the toast is showing, which is not always what the state says. */
  private message?: string;
  /** The district panel's own line, rebuilt only when the district turns over. */
  private headline = "";
  private status?: RunStatus;
  private chain?: number;
  private muted?: boolean;
  /**
   * Last charge count painted per weapon. `-1` is "never painted", which is
   * what makes the first frame fill every pip strip in.
   */
  private readonly charges = new Map<GadgetKind, number>();

  public constructor(root: HTMLElement) {
    this.root = root;
    this.nodes = buildHud(root);
    for (const kind of GADGET_ORDER) {
      this.charges.set(kind, -1);
    }
  }

  /**
   * `chain` is the takedown streak the hero is on, `muted` the sound state and
   * `charges` what is left in the arsenal. All three live outside `GameState`,
   * and all three default to the quiet case so a caller that does not track
   * them still renders a correct HUD.
   */
  public render(
    state: GameState,
    chain = 0,
    muted = false,
    charges?: GadgetCharges,
  ): void {
    const { player, progression } = state;
    const nodes = this.nodes;

    if (player.score !== this.score) {
      this.score = player.score;
      nodes.score.textContent = `${player.score} pts`;
    }
    if (player.health !== this.health || player.maxHealth !== this.maxHealth) {
      this.health = player.health;
      this.maxHealth = player.maxHealth;
      this.writeHealth(player.health, player.maxHealth);
    }

    const threats = countLivingEnemies(state);
    if (
      threats !== this.threats ||
      progression.levelIndex !== this.levelIndex
    ) {
      this.threats = threats;
      // Authored count, not the live list: defeated enemies may be reaped from
      // state, and a cleared district must not read as one that never had any.
      nodes.threats.textContent = threatLabel(
        threats,
        getLevelByIndex(progression.levelIndex).enemies.length,
      );
    }

    // Name, subtitle, accent and kicker all turn over together on a transition.
    if (progression.levelIndex !== this.levelIndex) {
      this.levelIndex = progression.levelIndex;
      this.writeLevel(progression.levelIndex);
    }
    // `visitedLevelIds` only ever grows, so its length is a faithful stand-in
    // for its contents and costs no join.
    if (progression.visitedLevelIds.length !== this.visitedCount) {
      this.visitedCount = progression.visitedLevelIds.length;
      this.writeDots(progression);
    }

    if (player.gadget !== this.gadget) {
      this.writeGadget(this.gadget, player.gadget);
      this.gadget = player.gadget;
    }
    if (charges) {
      this.writeCharges(charges);
    }
    // The district panel already carries its own headline. The toast sits in the
    // best space on the screen and is worth spending on news — a bomb away, the
    // Weaver holding the bridge — so an echo of the panel is dropped instead.
    const toast = player.message === this.headline ? "" : player.message;
    if (toast !== this.message) {
      this.message = toast;
      nodes.message.textContent = toast;
    }
    if (chain !== this.chain) {
      this.chain = chain;
      this.writeChain(chain);
    }
    if (muted !== this.muted) {
      this.muted = muted;
      this.writeMute(muted);
    }

    const status = bannerStatus(state);
    if (status !== this.status) {
      this.status = status;
      this.writeStatus(state, status);
    }
  }

  private writeHealth(health: number, maxHealth: number): void {
    const ratio = maxHealth > 0 ? health / maxHealth : 0;
    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    this.nodes.barFill.style.width = `${percent}%`;
    this.nodes.bar.setAttribute("aria-valuenow", String(health));
    this.nodes.bar.setAttribute("aria-valuemax", String(maxHealth));
    this.nodes.health.textContent = `Health ${health}/${maxHealth}`;
  }

  private writeLevel(levelIndex: number): void {
    const level = getLevelByIndex(levelIndex);
    this.headline = `${level.name}: ${level.subtitle}`;
    this.nodes.kicker.textContent = `Level ${levelIndex + 1} / ${LEVELS.length}`;
    this.nodes.levelName.textContent = level.name;
    this.nodes.subtitle.textContent = level.subtitle;
    this.root.style.setProperty("--level-accent", level.accent);
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
      this.nodes.gadgets.get(previous)?.root.classList.remove("is-active");
    }
    if (active !== "") {
      this.nodes.gadgets.get(active)?.root.classList.add("is-active");
    }
  }

  /**
   * Dims the pips the hero has spent. Charges are whole numbers, so a steady
   * frame compares six integers and touches nothing.
   */
  private writeCharges(charges: GadgetCharges): void {
    for (const kind of GADGET_ORDER) {
      const held = charges[kind];
      if (held === this.charges.get(kind)) {
        continue;
      }
      this.charges.set(kind, held);

      const chip = this.nodes.gadgets.get(kind);
      if (!chip) {
        continue;
      }
      chip.pips.forEach((pip, index) => {
        pip.classList.toggle("is-spent", index >= held);
      });
      chip.root.classList.toggle("is-empty", held <= 0);
      chip.root.setAttribute(
        "aria-label",
        `${ARSENAL[kind].label}: ${held} of ${ARSENAL[kind].capacity}`,
      );
    }
  }

  private writeChain(chain: number): void {
    const combo = this.nodes.combo;
    if (chain < MIN_SHOWN_CHAIN) {
      combo.hidden = true;
      combo.textContent = "";
      return;
    }

    combo.hidden = false;
    combo.textContent = `${chain} chain`;
    // The chip's heat is a CSS variable rather than a class per link, so the
    // stylesheet decides how a long chain looks and this only counts.
    combo.style.setProperty("--chain", String(Math.min(chain, MAX_HEAT)));
  }

  private writeMute(muted: boolean): void {
    this.nodes.mute.classList.toggle("is-muted", muted);
    this.nodes.mute.setAttribute(
      "aria-label",
      muted ? "Sound off. Press M to unmute." : "Sound on. Press M to mute.",
    );
  }

  /**
   * The banner owns its own copy; the HUD only says which status it is and
   * hands over the numbers a finished run reads back. The status also lands on
   * the root, so the stylesheet can pull the in-play clusters back out of the
   * way without the HUD having to touch each of them.
   */
  private writeStatus(state: GameState, status: RunStatus): void {
    this.root.dataset.run = status;
    writeBanner(this.nodes.banner, status, runSummary(state));
  }
}
