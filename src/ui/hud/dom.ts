import { LEVELS } from "../../game/content/levels";
import type { GadgetKind } from "../../game/simulation/state";

const HERO_NAME = "Ghost Pirouette";

const GADGETS: ReadonlyArray<readonly [GadgetKind, string]> = [
  ["web-net", "Net"],
  ["web-shield", "Shield"],
  ["web-wings", "Wings"],
];

const HINTS: ReadonlyArray<readonly [string, string]> = [
  ["A/D", "move"],
  ["W/S", "reel web"],
  ["Space", "jump"],
  ["E", "hold to swing"],
  ["J", "strike"],
  ["Q/K", "gadget"],
  ["Shift", "glide"],
  ["R", "restart"],
];

/** Every node the HUD ever writes to. Built once, then reused every frame. */
export interface HudNodes {
  score: HTMLElement;
  bar: HTMLElement;
  barFill: HTMLElement;
  health: HTMLElement;
  threats: HTMLElement;
  kicker: HTMLElement;
  levelName: HTMLElement;
  subtitle: HTMLElement;
  dots: readonly HTMLElement[];
  gadgets: ReadonlyMap<GadgetKind, HTMLElement>;
  message: HTMLElement;
  banner: HTMLElement;
  bannerTitle: HTMLElement;
  bannerHint: HTMLElement;
}

type Add = <K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  className: string,
  text?: string,
) => HTMLElementTagNameMap[K];

const adder =
  (doc: Document): Add =>
  (parent, tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    parent.append(node);
    return node;
  };

const buildStatusCluster = (
  add: Add,
  parent: HTMLElement,
): Pick<
  HudNodes,
  "score" | "bar" | "barFill" | "health" | "threats" | "gadgets"
> => {
  const cluster = add(parent, "section", "status-cluster");
  cluster.setAttribute("aria-label", "Player status");

  const heroRow = add(cluster, "div", "hero-row");
  add(heroRow, "span", "hero-name", HERO_NAME);
  const score = add(heroRow, "span", "score");

  const bar = add(cluster, "div", "bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Health");
  bar.setAttribute("aria-valuemin", "0");
  const barFill = add(bar, "div", "bar-fill");

  const objective = add(cluster, "div", "objective");
  const health = add(objective, "span", "objective-health");
  const threats = add(objective, "span", "objective-threats");

  const gadgetRow = add(cluster, "div", "gadget-row");
  gadgetRow.setAttribute("aria-label", "Gadget");
  const gadgets = new Map(
    GADGETS.map(([kind, label]) => {
      const chip = add(gadgetRow, "span", "gadget-chip", label);
      chip.dataset.gadget = kind;
      return [kind, chip] as const;
    }),
  );

  return { score, bar, barFill, health, threats, gadgets };
};

const buildLevelCluster = (
  add: Add,
  parent: HTMLElement,
): Pick<HudNodes, "kicker" | "levelName" | "subtitle" | "dots"> => {
  const cluster = add(parent, "section", "level-cluster");
  cluster.setAttribute("aria-label", "Current level");
  const kicker = add(cluster, "span", "level-kicker");
  const levelName = add(cluster, "strong", "level-name");
  const subtitle = add(cluster, "span", "level-subtitle");
  const dotRow = add(cluster, "span", "level-dots");
  dotRow.setAttribute("aria-hidden", "true");
  const dots = LEVELS.map(() => add(dotRow, "span", "level-dot"));

  return { kicker, levelName, subtitle, dots };
};

const buildHints = (add: Add, parent: HTMLElement): void => {
  const chip = add(parent, "aside", "hint-chip");
  for (const [key, action] of HINTS) {
    const hint = add(chip, "span", "hint");
    add(hint, "span", "hint-key", key);
    add(hint, "span", "hint-action", action);
  }
};

/** Replaces `root`'s contents with the HUD skeleton and returns its live nodes. */
export const buildHud = (root: HTMLElement): HudNodes => {
  const add = adder(root.ownerDocument);
  root.replaceChildren();

  const top = add(root, "div", "hud-top");
  const status = buildStatusCluster(add, top);
  const level = buildLevelCluster(add, top);
  buildHints(add, root);

  const message = add(root, "div", "message");
  message.setAttribute("aria-live", "polite");

  const banner = add(root, "div", "run-banner");
  banner.setAttribute("role", "status");
  banner.hidden = true;
  const bannerTitle = add(banner, "strong", "run-banner-title");
  const bannerHint = add(banner, "span", "run-banner-hint");

  return { ...status, ...level, message, banner, bannerTitle, bannerHint };
};
