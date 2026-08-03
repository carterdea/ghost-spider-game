import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { LEVELS } from "../../game/content/levels";
import {
  createInitialGameState,
  type GameState,
} from "../../game/simulation/state";
import { Hud } from "./hud";

/**
 * Builds a state the HUD can read, overriding every field it paints so the
 * assertions never depend on the simulation's starting values.
 */
const makeState = (overrides: {
  health?: number;
  maxHealth?: number;
  score?: number;
  gadget?: GameState["player"]["gadget"];
  message?: string;
  levelIndex?: number;
  status?: GameState["progression"]["status"];
  enemyHealths?: number[];
}): GameState => {
  const levelIndex = overrides.levelIndex ?? 0;
  const state = createInitialGameState(LEVELS[levelIndex] ?? LEVELS[0]);

  state.player.health = overrides.health ?? 100;
  state.player.maxHealth = overrides.maxHealth ?? 100;
  state.player.score = overrides.score ?? 0;
  state.player.gadget = overrides.gadget ?? "web-net";
  state.player.message = overrides.message ?? "Swing, climb, clear the block.";

  const template = state.enemies[0];
  state.enemies = (overrides.enemyHealths ?? [40, 40, 40]).map(
    (health, index) => ({ ...template, id: `enemy-${index}`, health }),
  );

  state.progression.levelIndex = levelIndex;
  state.progression.visitedLevelIds = LEVELS.slice(0, levelIndex + 1).map(
    (level) => level.id,
  );
  state.progression.status = overrides.status ?? "playing";

  return state;
};

const query = (root: HTMLElement, selector: string): HTMLElement => {
  const node = root.querySelector<HTMLElement>(selector);
  if (node === null) {
    throw new Error(`missing HUD node: ${selector}`);
  }
  return node;
};

/** Records every DOM change the callback causes inside `root`. */
const mutationsDuring = (root: HTMLElement, act: () => void) => {
  const observer = new MutationObserver(() => {});
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  act();
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
};

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

let root: HTMLElement;
let hud: Hud;

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
  hud = new Hud(root);
});

describe("first render", () => {
  test("fills in hero, score, health, level, gadget and message", () => {
    hud.render(
      makeState({
        score: 1200,
        health: 80,
        gadget: "web-shield",
        message: "Nice landing.",
        levelIndex: 1,
      }),
    );

    expect(query(root, ".hero-name").textContent).toBe("Ghost Pirouette");
    expect(query(root, ".score").textContent).toBe("1200 pts");
    expect(query(root, ".objective-health").textContent).toBe("Health 80/100");
    expect(query(root, ".objective-threats").textContent).toBe(
      "3 threats remain",
    );
    expect(query(root, ".level-kicker").textContent).toBe(
      `Level 2 / ${LEVELS.length}`,
    );
    expect(query(root, ".level-name").textContent).toBe(LEVELS[1].name);
    expect(query(root, ".level-subtitle").textContent).toBe(LEVELS[1].subtitle);
    expect(query(root, ".message").textContent).toBe("Nice landing.");
    expect(
      query(root, '[data-gadget="web-shield"]').classList.contains("is-active"),
    ).toBe(true);
  });

  test("tints the HUD with the current level accent", () => {
    hud.render(makeState({ levelIndex: 3 }));

    expect(root.style.getPropertyValue("--level-accent")).toBe(
      LEVELS[3].accent,
    );
  });

  test("counts only live enemies of the current level", () => {
    hud.render(makeState({ enemyHealths: [10, 0, 0, 5] }));
    expect(query(root, ".objective-threats").textContent).toBe(
      "2 threats remain",
    );

    hud.render(makeState({ enemyHealths: [0, 0] }));
    expect(query(root, ".objective-threats").textContent).toBe(
      "District clear",
    );
  });

  test("survives an out-of-range level index", () => {
    const state = makeState({});
    state.progression.levelIndex = 99;

    expect(() => hud.render(state)).not.toThrow();
    expect(query(root, ".level-name").textContent).toBe(
      LEVELS[LEVELS.length - 1].name,
    );
  });
});

describe("incremental rendering", () => {
  test("re-rendering identical state performs no DOM writes", () => {
    const state = makeState({ score: 40, message: "Hold on." });
    hud.render(state);

    const before = Array.from(root.querySelectorAll("*"));
    const records = mutationsDuring(root, () => {
      hud.render(state);
      hud.render(state);
      hud.render(state);
    });

    expect(records).toHaveLength(0);

    const after = Array.from(root.querySelectorAll("*"));
    expect(after).toHaveLength(before.length);
    after.forEach((node, index) => {
      expect(node).toBe(before[index]);
    });
  });

  test("a score change touches the score node and nothing else", () => {
    hud.render(makeState({ score: 0 }));

    const records = mutationsDuring(root, () => {
      hud.render(makeState({ score: 250 }));
    });

    expect(records.length).toBeGreaterThan(0);
    const targets = new Set(records.map((record) => record.target));
    expect(targets.size).toBe(1);
    expect(targets.has(query(root, ".score"))).toBe(true);
    expect(query(root, ".score").textContent).toBe("250 pts");
  });
});

describe("health", () => {
  test("bar width and aria values track health", () => {
    hud.render(makeState({ health: 100 }));

    const bar = query(root, ".bar");
    const fill = query(root, ".bar-fill");
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(fill.style.width).toBe("100%");

    hud.render(makeState({ health: 25 }));
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(fill.style.width).toBe("25%");
  });

  test("zero health renders the knocked-out banner", () => {
    hud.render(makeState({ health: 0, status: "knockedOut" }));

    const banner = query(root, ".run-banner");
    expect(banner.hidden).toBe(false);
    expect(banner.classList.contains("is-knockedOut")).toBe(true);
    expect(query(root, ".run-banner-title").textContent).toBe("Knocked Out");
    expect(query(root, ".run-banner-hint").textContent).toContain("Press R");
    expect(query(root, ".bar-fill").style.width).toBe("0%");
  });
});

describe("run status banner", () => {
  test("is hidden while playing", () => {
    hud.render(makeState({ status: "playing" }));

    expect(query(root, ".run-banner").hidden).toBe(true);
    expect(query(root, ".run-banner-title").textContent).toBe("");
  });

  test("celebrates a cleared run", () => {
    hud.render(makeState({ status: "cleared", levelIndex: LEVELS.length - 1 }));

    const banner = query(root, ".run-banner");
    expect(banner.hidden).toBe(false);
    expect(banner.classList.contains("is-cleared")).toBe(true);
    expect(query(root, ".run-banner-title").textContent).toBe(
      "Skyline Secured",
    );
  });

  test("hides again when a new run starts", () => {
    hud.render(makeState({ status: "knockedOut", health: 0 }));
    hud.render(makeState({ status: "playing", health: 100 }));

    expect(query(root, ".run-banner").hidden).toBe(true);
  });
});

describe("progress dots", () => {
  test("marks visited levels and exactly one current level", () => {
    hud.render(makeState({ levelIndex: 2 }));

    const dots = Array.from(root.querySelectorAll(".level-dot"));
    expect(dots).toHaveLength(LEVELS.length);
    // Everything up to and including the current district, and nothing past it.
    expect(dots.map((dot) => dot.classList.contains("is-active"))).toEqual(
      LEVELS.map((_, index) => index <= 2),
    );
    expect(dots.filter((dot) => dot.classList.contains("is-current"))).toEqual([
      dots[2],
    ]);
  });

  test("moves the current marker as the run advances", () => {
    hud.render(makeState({ levelIndex: 0 }));
    hud.render(makeState({ levelIndex: 1 }));

    const dots = Array.from(root.querySelectorAll(".level-dot"));
    expect(dots[0].classList.contains("is-current")).toBe(false);
    expect(dots[0].classList.contains("is-active")).toBe(true);
    expect(dots[1].classList.contains("is-current")).toBe(true);
  });
});

describe("gadgets", () => {
  test("highlights the selected gadget and only that one", () => {
    hud.render(makeState({ gadget: "web-net" }));

    const chips = Array.from(root.querySelectorAll(".gadget-chip"));
    expect(chips).toHaveLength(3);
    expect(chips.map((chip) => chip.classList.contains("is-active"))).toEqual([
      true,
      false,
      false,
    ]);

    hud.render(makeState({ gadget: "web-wings" }));
    expect(chips.map((chip) => chip.classList.contains("is-active"))).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("combo chain", () => {
  test("stays out of the way until there is a chain to show", () => {
    hud.render(makeState({}), 0);
    expect(query(root, ".combo").hidden).toBe(true);

    hud.render(makeState({}), 1);
    expect(query(root, ".combo").hidden).toBe(true);

    hud.render(makeState({}), 2);
    const combo = query(root, ".combo");
    expect(combo.hidden).toBe(false);
    expect(combo.textContent).toBe("2 chain");
  });

  test("runs hotter as the chain grows, and stops at the cap", () => {
    const combo = query(root, ".combo");

    hud.render(makeState({}), 3);
    expect(combo.style.getPropertyValue("--chain")).toBe("3");

    hud.render(makeState({}), 40);
    expect(combo.style.getPropertyValue("--chain")).toBe("7");
  });

  test("clears itself when the chain breaks", () => {
    hud.render(makeState({}), 4);
    hud.render(makeState({}), 0);

    const combo = query(root, ".combo");
    expect(combo.hidden).toBe(true);
    expect(combo.textContent).toBe("");
  });

  test("an unchanged chain writes nothing", () => {
    const state = makeState({});
    hud.render(state, 3);

    const records = mutationsDuring(root, () => {
      hud.render(state, 3);
      hud.render(state, 3);
    });

    expect(records).toHaveLength(0);
  });
});

describe("mute affordance", () => {
  test("shows the sound state and says which it is", () => {
    hud.render(makeState({}), 0, false);
    const mute = query(root, ".mute");
    expect(mute.classList.contains("is-muted")).toBe(false);
    expect(mute.getAttribute("aria-label")).toContain("Sound on");

    hud.render(makeState({}), 0, true);
    expect(mute.classList.contains("is-muted")).toBe(true);
    expect(mute.getAttribute("aria-label")).toContain("Sound off");

    hud.render(makeState({}), 0, false);
    expect(mute.classList.contains("is-muted")).toBe(false);
  });

  test("draws a speaker rather than shipping an icon", () => {
    hud.render(makeState({}));

    const svg = query(root, ".mute").querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelectorAll(".mute path")).toHaveLength(4);
  });

  test("an unchanged sound state writes nothing", () => {
    const state = makeState({});
    hud.render(state, 0, true);

    const records = mutationsDuring(root, () => {
      hud.render(state, 0, true);
      hud.render(state, 0, true);
    });

    expect(records).toHaveLength(0);
  });
});

describe("message safety", () => {
  test("renders markup-looking text literally", () => {
    const payload = "<img src=x onerror=alert(1)>";
    hud.render(makeState({ message: payload }));

    const message = query(root, ".message");
    expect(message.textContent).toBe(payload);
    expect(message.querySelector("img")).toBeNull();
    expect(root.querySelector("img")).toBeNull();
    expect(message.children).toHaveLength(0);
  });

  test("announces messages politely", () => {
    hud.render(makeState({}));

    expect(query(root, ".message").getAttribute("aria-live")).toBe("polite");
  });
});
