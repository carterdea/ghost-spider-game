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

  test("destroy takes the line with it", () => {
    const scene = new SceneDouble();
    const webs = new WebRenderer(asScene(scene));

    webs.release(anchor, hand);
    webs.destroy();

    expect(scene.liveObjects()).toHaveLength(0);
  });
});
