import assert from "node:assert/strict";
import test from "node:test";
import { Bone, Group, Skeleton, SkinnedMesh } from "three";
import { prepareHighCollarShoulders } from "../src/game/characters/highCollarShoulders.ts";

test("both waist fits follow each arm independently in the chest frame", () => {
  const actor = new Group(), cloth = new Group();
  const chest = new Bone(), left = new Bone(), right = new Bone();
  chest.name = "spine_05";
  left.name = "upperarm_l";
  right.name = "upperarm_r";
  actor.add(cloth, chest);
  chest.add(left, right);
  actor.updateMatrixWorld(true);
  const skeleton = new Skeleton([chest, left, right]);
  assert.equal(prepareHighCollarShoulders(cloth, skeleton), undefined);
  for (const waist of ["tucked", "over"]) {
    const part = new SkinnedMesh();
    part.name = waist;
    part.bind(skeleton);
    part.morphTargetDictionary = { CorsetShoulderR: 0, Other: 1, CorsetShoulderL: 2 };
    part.morphTargetInfluences = [0, .3, 0];
    cloth.add(part);
  }
  const update = prepareHighCollarShoulders(cloth, skeleton);
  // Turning or leaning the entire actor must not pull the clothing off the chest.
  actor.rotation.set(.5, .4, -.3);
  chest.rotation.x = .4;
  const check = (leftWeight, rightWeight) => {
    update();
    for (const part of cloth.children) {
      assert.deepEqual(part.morphTargetInfluences, [rightWeight, .3, leftWeight]);
    }
  };
  check(0, 0);
  left.rotation.z = Math.PI / 2;
  check(1, 0);
  right.rotation.z = -Math.PI / 2;
  check(1, 1);
  left.rotation.z = 0;
  check(0, 1);
  right.rotation.z = 0;
  check(0, 0);
});

test("the over hem covers the equipped Village belt and tucked restores its visibility", async t => {
  const { createServer } = await import("vite");
  const vite = await createServer({ optimizeDeps: { noDiscovery: true, entries: [], include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
  t.after(() => vite.close());
  const { prepareWardrobeGarments } = await vite.ssrLoadModule("/src/game/characters/wardrobeGarmentFit.ts");
  const { getWardrobeGarment } = await vite.ssrLoadModule("/src/game/characters/wardrobeGarments.ts");
  for (const mode of ["stock", "equipped", "removed", "original-hidden", "other-corset"]) {
    const root = new Group(), body = new SkinnedMesh(), belt = new SkinnedMesh(), skeleton = new Skeleton([new Bone()]);
    body.name = "BODY_OUTFIT_CUT";
    belt.name = "ACC_BELT";
    belt.visible = mode !== "original-hidden";
    body.bind(skeleton);
    belt.bind(skeleton);
    root.add(body, belt);
    const corset = { group: new Group(), apply() {}, updateShoulders: mode === "other-corset" ? undefined : () => {} };
    const sources = mode === "equipped" ? [{ item: getWardrobeGarment("village-belt"), scene: root }] : [];
    const fit = prepareWardrobeGarments(root, sources, undefined, corset, mode === "removed" ? ["belt"] : []);
    const equipped = mode === "equipped" ? root.getObjectByName("wardrobe-village-belt") : belt;
    for (const waist of ["over", "tucked", "over"]) {
      fit.apply({ corset: { waist }, overEase: 0, appearance: { color: "original" }, outfit: { id: "village" } });
      const wanted = mode === "other-corset" || (waist === "tucked" && (mode === "stock" || mode === "equipped"));
      assert.equal(equipped.visible, wanted, mode + " " + waist);
      if (mode === "equipped") assert.equal(belt.visible, false);
    }
    fit.dispose();
    if (mode === "stock" || mode === "original-hidden" || mode === "equipped") {
      assert.equal(equipped.visible, mode !== "original-hidden", mode + " dispose");
    }
  }
});
