import { LEVELS } from "../../game/content/levels";
import type { GadgetKind } from "../../game/simulation/state";
import {
  ARSENAL,
  GADGET_ORDER,
} from "../../game/simulation/systems/weapons/arsenal";

const HERO_NAME = "Ghost Pirouette";

const HINTS: ReadonlyArray<readonly [string, string]> = [
  ["A/D", "move"],
  ["W/S", "reel web"],
  ["Space", "jump"],
  ["E", "hold to swing"],
  ["J", "strike"],
  ["Q/K", "cycle / fire"],
  ["Shift", "glide"],
  ["M", "mute"],
  ["R", "restart"],
];

/**
 * The speaker glyph, as paths on a 16x16 grid: a cone, two sound waves, and the
 * slash that crosses it out. Drawn rather than loaded, like everything else the
 * game renders.
 */
const SPEAKER = {
  cone: "M2.5 6h2.6l3.7-3v10l-3.7-3H2.5z",
  waves: ["M10.4 5.8a3.2 3.2 0 0 1 0 4.4", "M12.3 3.9a6 6 0 0 1 0 8.2"],
  slash: "M10.6 4.6 15.2 11.6",
} as const;

/**
 * One weapon's chip: the slot itself, and one pip per charge it can hold. The
 * pips are built to the weapon's capacity, so the HUD never has to be told how
 * many the hero carries.
 */
export interface GadgetChip {
  readonly root: HTMLElement;
  readonly pips: readonly HTMLElement[];
}

/** Every node the HUD ever writes to. Built once, then reused every frame. */
export interface HudNodes {
  score: HTMLElement;
  combo: HTMLElement;
  mute: HTMLElement;
  bar: HTMLElement;
  barFill: HTMLElement;
  health: HTMLElement;
  threats: HTMLElement;
  kicker: HTMLElement;
  levelName: HTMLElement;
  subtitle: HTMLElement;
  dots: readonly HTMLElement[];
  gadgets: ReadonlyMap<GadgetKind, GadgetChip>;
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

const SVG_NS = "http://www.w3.org/2000/svg";

/** The muted/unmuted speaker. `Hud` toggles the `is-muted` class on the wrapper. */
const buildMute = (doc: Document, parent: HTMLElement): HTMLElement => {
  const wrapper = doc.createElement("span");
  wrapper.className = "mute";
  wrapper.setAttribute("role", "status");

  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");

  for (const [className, d] of [
    ["mute-cone", SPEAKER.cone],
    ...SPEAKER.waves.map((wave) => ["mute-wave", wave] as const),
    ["mute-slash", SPEAKER.slash],
  ] as ReadonlyArray<readonly [string, string]>) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("class", className);
    path.setAttribute("d", d);
    svg.append(path);
  }

  wrapper.append(svg);
  parent.append(wrapper);
  return wrapper;
};

/** One weapon slot: its name, and a pip for every charge it holds at full. */
const buildGadgetChip = (
  add: Add,
  row: HTMLElement,
  kind: GadgetKind,
): GadgetChip => {
  const spec = ARSENAL[kind];
  const root = add(row, "span", "gadget-chip");
  root.dataset.gadget = kind;
  add(root, "span", "gadget-label", spec.label);

  const strip = add(root, "span", "gadget-pips");
  strip.setAttribute("aria-hidden", "true");
  const pips = Array.from({ length: spec.capacity }, () =>
    add(strip, "span", "gadget-pip"),
  );

  return { root, pips };
};

const buildStatusCluster = (
  add: Add,
  parent: HTMLElement,
): Pick<
  HudNodes,
  | "score"
  | "combo"
  | "mute"
  | "bar"
  | "barFill"
  | "health"
  | "threats"
  | "gadgets"
> => {
  const cluster = add(parent, "section", "status-cluster");
  cluster.setAttribute("aria-label", "Player status");

  const heroRow = add(cluster, "div", "hero-row");
  add(heroRow, "span", "hero-name", HERO_NAME);
  const meta = add(heroRow, "span", "hero-meta");
  const combo = add(meta, "span", "combo");
  combo.hidden = true;
  const score = add(meta, "span", "score");
  const mute = buildMute(parent.ownerDocument, meta);

  const bar = add(cluster, "div", "bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Health");
  bar.setAttribute("aria-valuemin", "0");
  const barFill = add(bar, "div", "bar-fill");

  const objective = add(cluster, "div", "objective");
  const health = add(objective, "span", "objective-health");
  const threats = add(objective, "span", "objective-threats");

  const gadgetRow = add(cluster, "div", "gadget-row");
  gadgetRow.setAttribute("aria-label", "Arsenal");
  const gadgets = new Map(
    GADGET_ORDER.map((kind) => [kind, buildGadgetChip(add, gadgetRow, kind)]),
  );

  return { score, combo, mute, bar, barFill, health, threats, gadgets };
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
