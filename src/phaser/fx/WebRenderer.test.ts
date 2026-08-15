import { describe, expect, test } from "bun:test";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { WebRenderer } from "./WebRenderer";

const anchor = { x: 100, y: 200 };
const hand = { x: 140, y: 260 };
/** The hero's centre: the point the solver measures its rope from. */
const body = { x: 132, y: 258 };

/** Both layers are created in the constructor and outlive every level. */
const lineGraphic = (scene: SceneDouble) => scene.objects[0];
const patchGraphic = (scene: SceneDouble) => scene.objects[1];
const LAYERS = 2;

/** Everything after the two layers is a strand cut loose from a released web. */
const strandGraphics = (scene: SceneDouble) => scene.objects.slice(LAYERS);

describe("fading strands", () => {
  test("a released strand is drawn, then destroyed once it has faded", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.release(anchor, hand);
    expect(strandGraphics(scene)).toHaveLength(1);

    scene.now = 400;
    webs.update();
    expect(scene.liveObjects()).toHaveLength(LAYERS + 1);

    scene.now = 1000;
    webs.update();
    expect(strandGraphics(scene).every((web) => web.destroyed)).toBe(true);
    expect(lineGraphic(scene).destroyed).toBe(false);

    // The faded strand is off the list: a later frame must not touch it again.
    webs.update();
    expect(strandGraphics(scene).every((web) => web.destroyCount === 1)).toBe(
      true,
    );
  });

  test("strands fade independently", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.release(anchor, hand);
    scene.now = 600;
    webs.release(anchor, hand);

    scene.now = 1000;
    webs.update();

    const [first, second] = strandGraphics(scene);
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
  });

  test("a player mashing the web key cannot stack strands without limit", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    for (let cut = 0; cut < 40; cut += 1) {
      webs.release(anchor, hand);
    }

    expect(webs.liveStrands).toBeLessThanOrEqual(8);
    // Every strand the cap dropped was destroyed on the way out, exactly once.
    expect(strandGraphics(scene)).toHaveLength(40);
    expect(strandGraphics(scene).every((web) => web.destroyCount <= 1)).toBe(
      true,
    );
    expect(scene.liveObjects()).toHaveLength(webs.liveStrands + LAYERS);
  });
});

describe("splats", () => {
  test("a splat is drawn, then retires on its own", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.splat({ x: 300, y: 400 }, 1);
    expect(webs.liveSplats).toBe(1);

    scene.now = 500;
    webs.update();
    expect(webs.liveSplats).toBe(1);

    scene.now = 2000;
    webs.update();
    expect(webs.liveSplats).toBe(0);
  });

  test("a patch never covers the enemy wind-up it was fired at", () => {
    const scene = new SceneDouble();
    new WebRenderer(asScene(scene));

    // The hero is at 8 and a wind-up at 7; webbing stuck to the world may not
    // cover either, and has to sit over the platforms it lands on, at 6.
    expect(patchGraphic(scene).depth).toBeGreaterThan(6);
    expect(patchGraphic(scene).depth).toBeLessThan(7);
    // The line the hero is hanging from is the one thing drawn over everything.
    expect(lineGraphic(scene).depth).toBe(20);
  });

  test("splats never outgrow their cap, and need no graphic of their own", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    for (let hit = 0; hit < 60; hit += 1) {
      webs.splat({ x: hit * 10, y: 400 }, 0.5);
    }
    webs.update();

    expect(webs.liveSplats).toBeLessThanOrEqual(14);
    expect(scene.liveObjects()).toHaveLength(LAYERS);
  });
});

describe("the live line", () => {
  test("drawing and animating it allocates no game objects", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.launch(anchor, hand);
    for (let frame = 0; frame < 120; frame += 1) {
      scene.now = frame * 16;
      webs.drawLine(anchor, hand, 320, body);
      webs.update();
    }

    expect(scene.objects).toHaveLength(LAYERS);
    expect(scene.tweenLog).toHaveLength(0);
    expect(scene.timerLog).toHaveLength(0);
  });

  test("a line with slack in it bows, and pulls straight as it takes the load", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));
    // 360.6px from the anchor: the length a taut rope would be holding.
    const swinging = { x: 300, y: 500 };
    const taut = Math.hypot(swinging.x - anchor.x, swinging.y - anchor.y);

    webs.drawLine(anchor, hand, taut + 60, swinging);
    expect(webs.sag).toBeGreaterThan(0);

    // The last of the slack going is the snap the player reads a swing off.
    webs.drawLine(anchor, hand, taut + 2, swinging);
    const nearlyTaut = webs.sag;
    webs.drawLine(anchor, hand, taut, swinging);

    expect(webs.sag).toBe(0);
    expect(nearlyTaut).toBeGreaterThan(0);
    expect(nearlyTaut).toBeLessThan(20);
  });

  test("the bow is measured from the hero, not from the fist the line leaves", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));
    // Further from the anchor than the hand is, as the hero is on the frames
    // the trailing arm is thrown out ahead of them.
    const behind = { x: 145, y: 268 };
    const rope = Math.hypot(behind.x - anchor.x, behind.y - anchor.y);

    webs.drawLine(anchor, hand, rope, behind);
    expect(webs.sag).toBe(0);

    // The same taut rope, measured from the fist: an arm's length of slack the
    // solver never had, bowing a line that is under full load.
    webs.drawLine(anchor, hand, rope);
    expect(webs.sag).toBeGreaterThan(0);
  });

  test("an unreadable accent leaves the current one alone", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.setAccent("not-a-colour");
    webs.setAccent("#55e8f0");
    webs.drawLine(anchor, hand);

    // Nothing to assert on the colour itself through the double; what matters
    // is that a bad district accent cannot throw mid-frame.
    expect(() => webs.update()).not.toThrow();
  });
});

describe("level transitions", () => {
  test("reset drops every strand but keeps the renderer usable", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.drawLine(anchor, hand);
    webs.release(anchor, hand);
    webs.release(anchor, hand);
    expect(strandGraphics(scene)).toHaveLength(2);

    webs.reset();

    expect(strandGraphics(scene).every((web) => web.destroyed)).toBe(true);
    expect(lineGraphic(scene).destroyed).toBe(false);

    // Nothing from the old level keeps updating into the new one.
    scene.now = 5000;
    webs.update();
    expect(strandGraphics(scene).every((web) => web.destroyCount === 1)).toBe(
      true,
    );

    webs.release(anchor, hand);
    expect(scene.liveObjects()).toHaveLength(LAYERS + 1);
  });

  test("reset takes the splats and the live line with it", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.splat({ x: 300, y: 400 }, 1);
    webs.launch(anchor, hand, true);
    webs.update();

    webs.reset();
    scene.now = 40;
    webs.update();

    expect(webs.liveSplats).toBe(0);
    expect(webs.liveStrands).toBe(0);
    expect(scene.liveObjects()).toHaveLength(LAYERS);
  });

  test("destroy takes the line with it", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.release(anchor, hand);
    webs.destroy();

    expect(scene.liveObjects()).toHaveLength(0);
  });
});
