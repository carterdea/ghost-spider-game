import { LEVELS } from "../../game/content/levels";
import type { RunStatus, RunSummary } from "../../game/simulation/state";
import { GAME_NAME, GAME_TAGLINE, HERO_NAME, HINTS } from "./controls";
import type { Add } from "./elements";

/**
 * The full-screen panel: the title the run opens on, the pause it is held in,
 * and the two ways it ends. One element for all four, because they are the same
 * thing — the world stopped, and a line of text about why.
 *
 * It is a status-driven view with no state of its own; `Hud` decides when the
 * status actually changed and calls `writeBanner` only then.
 */

/** What each held status says, and which panel it opens with. */
interface BannerCopy {
  readonly kicker: string;
  readonly title: string;
  readonly hint: string;
  readonly detail: "controls" | "summary";
}

const BANNERS: Record<RunStatus, BannerCopy | null> = {
  title: {
    kicker: HERO_NAME,
    title: GAME_NAME,
    hint: `${GAME_TAGLINE} Press Space to start.`,
    detail: "controls",
  },
  playing: null,
  paused: {
    kicker: "Held",
    title: "Paused",
    hint: "Press Esc or P to drop back in. R restarts the run.",
    detail: "controls",
  },
  cleared: {
    kicker: "Run complete",
    title: "Skyline Secured",
    hint: "Every district is clear. Press R to run it again.",
    detail: "summary",
  },
  knockedOut: {
    kicker: "Run over",
    title: "Knocked Out",
    hint: "The city needs you. Press R to restart.",
    detail: "summary",
  },
};

/** The four numbers worth reading back, in the order they are read. */
const STAT_LABELS = ["Score", "Districts", "Best chain", "Time"] as const;

type StatLabel = (typeof STAT_LABELS)[number];

export interface BannerNodes {
  /** Dims the world behind the panel. Sits under the HUD's own clusters. */
  readonly curtain: HTMLElement;
  readonly banner: HTMLElement;
  readonly kicker: HTMLElement;
  readonly title: HTMLElement;
  readonly hint: HTMLElement;
  readonly summary: HTMLElement;
  readonly stats: ReadonlyMap<StatLabel, HTMLElement>;
  readonly controls: HTMLElement;
}

/** `12:04`, and never a bare `4` for four seconds. */
export const formatDuration = (milliseconds: number): string => {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${String(seconds).padStart(2, "0")}`;
};

/** A chain of one is not a chain, and reads better as a dash than as a 1. */
const chainLabel = (best: number): string => (best > 1 ? `${best}×` : "—");

const statValue = (summary: RunSummary, label: StatLabel): string => {
  switch (label) {
    case "Score":
      return `${summary.score}`;
    case "Districts":
      return `${summary.districtsCleared} / ${LEVELS.length}`;
    case "Best chain":
      return chainLabel(summary.bestChain);
    case "Time":
      return formatDuration(summary.elapsedMs);
  }
};

const buildStats = (
  add: Add,
  parent: HTMLElement,
): ReadonlyMap<StatLabel, HTMLElement> =>
  new Map(
    STAT_LABELS.map((label) => {
      const cell = add(parent, "div", "run-stat");
      add(cell, "span", "run-stat-label", label);
      return [label, add(cell, "strong", "run-stat-value")] as const;
    }),
  );

const buildControls = (add: Add, parent: HTMLElement): HTMLElement => {
  const grid = add(parent, "div", "run-controls");
  grid.setAttribute("aria-label", "Controls");
  for (const [key, action] of HINTS) {
    const row = add(grid, "div", "run-control");
    add(row, "span", "run-control-key", key);
    add(row, "span", "run-control-action", action);
  }
  return grid;
};

export const buildBanner = (add: Add, root: HTMLElement): BannerNodes => {
  const curtain = add(root, "div", "curtain");
  curtain.setAttribute("aria-hidden", "true");
  curtain.hidden = true;

  const banner = add(root, "div", "run-banner");
  banner.setAttribute("role", "status");
  banner.hidden = true;

  const kicker = add(banner, "span", "run-banner-kicker");
  const title = add(banner, "strong", "run-banner-title");
  const hint = add(banner, "span", "run-banner-hint");

  const summary = add(banner, "div", "run-summary");
  summary.hidden = true;
  const stats = buildStats(add, summary);
  const controls = buildControls(add, banner);
  controls.hidden = true;

  return { curtain, banner, kicker, title, hint, summary, stats, controls };
};

/** Paints one status. Called only when the status actually turned over. */
export const writeBanner = (
  nodes: BannerNodes,
  status: RunStatus,
  summary: RunSummary,
): void => {
  const copy = BANNERS[status];

  nodes.curtain.className = copy === null ? "curtain" : `curtain is-${status}`;
  nodes.curtain.hidden = copy === null;
  nodes.banner.className =
    copy === null ? "run-banner" : `run-banner is-${status}`;
  nodes.banner.hidden = copy === null;

  nodes.kicker.textContent = copy?.kicker ?? "";
  nodes.title.textContent = copy?.title ?? "";
  nodes.hint.textContent = copy?.hint ?? "";

  nodes.controls.hidden = copy?.detail !== "controls";
  nodes.summary.hidden = copy?.detail !== "summary";
  if (copy?.detail !== "summary") {
    return;
  }

  for (const [label, node] of nodes.stats) {
    node.textContent = statValue(summary, label);
  }
};
