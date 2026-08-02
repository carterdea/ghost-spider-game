import { describe, expect, test } from "bun:test";
import { asScene, SceneDouble } from "../testing/sceneDouble";
import { createPropTextures, PROP_TEXTURES } from "./textures";

describe("prop textures", () => {
  test("generates every key once, from a single scratch graphics", () => {
    const scene = new SceneDouble();

    createPropTextures(asScene(scene));

    expect(scene.generatedTextures).toEqual([...PROP_TEXTURES]);
    expect(scene.objects).toHaveLength(1);
    expect(scene.objects[0].destroyed).toBe(true);
  });

  test("a second load regenerates nothing and removes nothing", () => {
    const scene = new SceneDouble();
    createPropTextures(asScene(scene));

    scene.generatedTextures.length = 0;
    createPropTextures(asScene(scene));

    expect(scene.generatedTextures).toHaveLength(0);
    expect(scene.removedTextures).toHaveLength(0);
    // No scratch graphics either: the whole pass is skipped.
    expect(scene.objects).toHaveLength(1);
  });

  test("fills in only the keys a scene is missing", () => {
    const scene = new SceneDouble();
    for (const key of PROP_TEXTURES) {
      scene.existingTextures.add(key);
    }
    scene.existingTextures.delete("bat");

    createPropTextures(asScene(scene));

    expect(scene.generatedTextures).toEqual(["bat"]);
    expect(scene.removedTextures).toHaveLength(0);
  });
});
