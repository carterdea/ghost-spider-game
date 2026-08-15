import type { GadgetKind } from "../../state";

/**
 * The arsenal, as data. Every difference between two weapons that the rest of
 * the game cares about — how many the hero carries, how fast they come back,
 * what the HUD calls them — is a row here rather than a branch somewhere else.
 */
interface GadgetSpec {
  /** HUD chip label. */
  readonly label: string;
  /** Printed when the weapon is fired. */
  readonly firedMessage: string;
  /** Printed when the hero pulls an empty slot. */
  readonly emptyMessage: string;
  /** Charges carried at full. */
  readonly capacity: number;
  /** Milliseconds to earn one charge back. */
  readonly rechargeMs: number;
  /** Shortest gap between two uses of anything, once this is fired. */
  readonly cooldownMs: number;
}

/**
 * Scarcity is the whole balance lever: a bomb that clears a rooftop is worth
 * two of anything else, so the hero carries two and waits nine seconds for one
 * back. The mobility gadgets recharge fastest — running dry mid-swing is a
 * death sentence rather than a decision.
 */
export const ARSENAL = {
  "web-bomb": {
    label: "Bomb",
    firedMessage: "Web bomb away.",
    emptyMessage: "Bomb pouch empty.",
    capacity: 2,
    rechargeMs: 9000,
    cooldownMs: 900,
  },
  "impact-web": {
    label: "Impact",
    firedMessage: "Impact web fired.",
    emptyMessage: "No impact rounds left.",
    capacity: 3,
    rechargeMs: 4200,
    cooldownMs: 480,
  },
  "web-line": {
    label: "Line",
    firedMessage: "Web line cast.",
    emptyMessage: "Line spool is dry.",
    capacity: 3,
    rechargeMs: 5200,
    cooldownMs: 620,
  },
  "web-net": {
    label: "Net",
    firedMessage: "Web net launched.",
    emptyMessage: "No nets folded.",
    capacity: 4,
    rechargeMs: 3200,
    cooldownMs: 620,
  },
  "web-shield": {
    label: "Shield",
    firedMessage: "Web shield spun.",
    emptyMessage: "Shield silk spent.",
    capacity: 2,
    rechargeMs: 7000,
    cooldownMs: 800,
  },
  "web-wings": {
    label: "Wings",
    firedMessage: "Web-wings vault.",
    emptyMessage: "Wings need spinning.",
    capacity: 3,
    rechargeMs: 2600,
    cooldownMs: 420,
  },
} as const satisfies Record<GadgetKind, GadgetSpec>;

/** Cycle order. Offence first: the hero reaches for a bomb far more than wings. */
export const GADGET_ORDER: readonly GadgetKind[] = [
  "web-bomb",
  "impact-web",
  "web-line",
  "web-net",
  "web-shield",
  "web-wings",
];

/**
 * Charges held and owed. Both maps are written in place every frame, so the
 * HUD can read them without either side allocating.
 */
export interface ArsenalState {
  charges: Record<GadgetKind, number>;
  /** When the next charge of each weapon lands, or `null` at full. */
  refillAt: Record<GadgetKind, number | null>;
  /** When anything at all may be fired again. One shared cooldown. */
  readyAt: number;
}

const fullCharges = (): Record<GadgetKind, number> => ({
  "web-bomb": ARSENAL["web-bomb"].capacity,
  "impact-web": ARSENAL["impact-web"].capacity,
  "web-line": ARSENAL["web-line"].capacity,
  "web-net": ARSENAL["web-net"].capacity,
  "web-shield": ARSENAL["web-shield"].capacity,
  "web-wings": ARSENAL["web-wings"].capacity,
});

const noRefills = (): Record<GadgetKind, number | null> => ({
  "web-bomb": null,
  "impact-web": null,
  "web-line": null,
  "web-net": null,
  "web-shield": null,
  "web-wings": null,
});

export const createArsenal = (): ArsenalState => ({
  charges: fullCharges(),
  refillAt: noRefills(),
  readyAt: 0,
});

/** Back to full. A new district resupplies the hero; a cooldown does not carry. */
export const refillArsenal = (arsenal: ArsenalState): void => {
  arsenal.charges = fullCharges();
  arsenal.refillAt = noRefills();
  arsenal.readyAt = 0;
};

/**
 * Grants every charge that has come due. The clock is a deadline rather than a
 * countdown, so a stalled frame cannot swallow a recharge and a long one cannot
 * hand back more than the weapon holds.
 */
export const tickArsenal = (arsenal: ArsenalState, now: number): void => {
  for (const kind of GADGET_ORDER) {
    const { capacity, rechargeMs } = ARSENAL[kind];
    let due = arsenal.refillAt[kind];

    while (due !== null && now >= due && arsenal.charges[kind] < capacity) {
      arsenal.charges[kind] += 1;
      due = arsenal.charges[kind] >= capacity ? null : due + rechargeMs;
    }

    arsenal.refillAt[kind] = arsenal.charges[kind] >= capacity ? null : due;
  }
};

/** Whether the shared cooldown has lifted and the slot has something in it. */
export const canFire = (
  arsenal: ArsenalState,
  kind: GadgetKind,
  now: number,
): boolean => now >= arsenal.readyAt && arsenal.charges[kind] > 0;

/**
 * Spends a charge, returning whether there was one to spend. A recharge already
 * in flight keeps its deadline: firing the last of a magazine must not push
 * back the charge the hero is already waiting on.
 */
export const spendCharge = (
  arsenal: ArsenalState,
  kind: GadgetKind,
  now: number,
): boolean => {
  tickArsenal(arsenal, now);
  if (!canFire(arsenal, kind, now)) {
    return false;
  }

  arsenal.charges[kind] -= 1;
  if (arsenal.refillAt[kind] === null) {
    arsenal.refillAt[kind] = now + ARSENAL[kind].rechargeMs;
  }
  arsenal.readyAt = now + ARSENAL[kind].cooldownMs;
  return true;
};

/** Progress toward the next charge, 0 to 1. Full weapons report 1. */
export const rechargeProgress = (
  arsenal: ArsenalState,
  kind: GadgetKind,
  now: number,
): number => {
  const due = arsenal.refillAt[kind];
  if (due === null) {
    return 1;
  }
  const elapsed = ARSENAL[kind].rechargeMs - (due - now);
  return Math.min(1, Math.max(0, elapsed / ARSENAL[kind].rechargeMs));
};

/** The next weapon along the cycle. `step` may be negative to walk backwards. */
export const nextGadget = (current: GadgetKind, step = 1): GadgetKind => {
  const count = GADGET_ORDER.length;
  const from = GADGET_ORDER.indexOf(current);
  const index = (((from + step) % count) + count) % count;
  return GADGET_ORDER[index];
};

/** The weapon in a given slot, for direct number-key selection. */
export const gadgetAt = (index: number): GadgetKind | undefined =>
  GADGET_ORDER[index];
