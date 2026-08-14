import { describe, expect, test } from "bun:test";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { WebRenderer } from "./WebRenderer";

const anchor = { x: 100, y: 200 };
const hand = { x: 140, y: 260 };

/** The line graphic is created in the constructor and outlives every level. */
const lineGraphic = (scene: SceneDouble) => scene.objects[0];
const strandGraphics = (scene: SceneDouble) => scene.objects.slice(1);

describe("fading strands", () => {
  test("a released strand is drawn, then destroyed once it has faded", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.release(anchor, hand);
    expect(strandGraphics(scene)).toHaveLength(1);

    scene.now = 400;
    webs.update();
    expect(scene.liveObjects()).toHaveLength(2);

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
    expect(scene.liveObjects()).toHaveLength(webs.liveStrands + 1);
  });
});

describe("splats", () => {
  test("a splat is drawn, then retires on its own", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.splat(300, 400, 1);
    expect(webs.liveSplats).toBe(1);

    scene.now = 500;
    webs.update();
    expect(webs.liveSplats).toBe(1);

    scene.now = 2000;
    webs.update();
    expect(webs.liveSplats).toBe(0);
  });

  test("splats never outgrow their cap, and need no graphic of their own", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    for (let hit = 0; hit < 60; hit += 1) {
      webs.splat(hit * 10, 400, 0.5);
    }
    webs.update();

    expect(webs.liveSplats).toBeLessThanOrEqual(14);
    expect(scene.liveObjects()).toHaveLength(1);
  });
});

describe("the live line", () => {
  test("drawing and animating it allocates no game objects", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.launch(anchor, hand);
    for (let frame = 0; frame < 120; frame += 1) {
      scene.now = frame * 16;
      webs.drawLine(anchor, hand, 320, 260);
      webs.update();
    }

    expect(scene.objects).toHaveLength(1);
    expect(scene.tweenLog).toHaveLength(0);
    expect(scene.timerLog).toHaveLength(0);
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
    expect(scene.liveObjects()).toHaveLength(2);
  });

  test("reset takes the splats and the live line with it", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.splat(300, 400, 1);
    webs.launch(anchor, hand);
    webs.update();

    webs.reset();
    scene.now = 40;
    webs.update();

    expect(webs.liveSplats).toBe(0);
    expect(webs.liveStrands).toBe(0);
    expect(scene.liveObjects()).toHaveLength(1);
  });

  test("destroy takes the line with it", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.release(anchor, hand);
    webs.destroy();

    expect(scene.liveObjects()).toHaveLength(0);
  });
});
