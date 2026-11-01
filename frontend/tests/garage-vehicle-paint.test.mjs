import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { prepareVehicleVisual } from "../src/vehicles/tools/vehicleMaterials.ts";
import { prepareGarageVehiclePaint } from "../src/game/preview/garageVehiclePaint.ts";

test("AE86 garage paint retains reflections while reducing white HDR glare without modifying cache or driving", () => {
  const scene = new Group(), geometry = new BoxGeometry(), map = new Texture();
  const paint = new MeshStandardMaterial({ color: 0xffffff, metalness: 0.559, roughness: 0.3545 });
  paint.name = "Primary.002";
  paint.map = map;
  const glass = new MeshStandardMaterial({ transparent: true, opacity: 0.25 });
  glass.name = "Windows.002";
  scene.add(new Mesh(geometry, [paint, glass]), new Mesh(geometry, paint));
  const preview = prepareVehicleVisual(scene, "ae86");
  prepareGarageVehiclePaint(preview.root, "ae86");
  const tuned = preview.root.children[0].material[0];
  assert.equal(tuned.color.r, 0.72);
  assert.equal(tuned.roughness, 0.42);
  assert.equal(tuned.metalness, paint.metalness);
  assert.equal(tuned.map, map);
  assert.equal(tuned.envMapIntensity, paint.envMapIntensity);
  assert.equal(tuned.emissive.getHex(), 0);
  assert.equal(preview.root.children[1].material, tuned, "shared paint is calibrated once");
  const state = tuned.toJSON();
  prepareGarageVehiclePaint(preview.root, "ae86");
  assert.deepEqual(tuned.toJSON(), state, "reapplying cannot dim it again");
  assert.equal(preview.root.children[0].material[1].opacity, 0.25);
  const runtime = prepareVehicleVisual(scene, "ae86");
  assert.equal(runtime.root.children[0].material[0].color.r, 1);
  assert.equal(paint.color.r, 1);
  assert.equal(paint.roughness, 0.3545);
  let textureDisposals = 0;
  map.addEventListener("dispose", () => textureDisposals++);
  preview.dispose(); runtime.dispose();
  assert.equal(textureDisposals, 0);
  geometry.dispose(); paint.dispose(); glass.dispose(); map.dispose();
});

test("garage calibration leaves other cars, trim, glass and custom AE86 paint alone", () => {
  for (const [model, name, color] of [["brz", "Primary.002", 0xffffff], ["ae86", "Trim2.002", 0xffffff], ["ae86", "Primary.002", 0x8844aa]]) {
    const root = new Group(), geometry = new BoxGeometry();
    const material = new MeshStandardMaterial({ color, roughness: 0.35 });
    material.name = name;
    root.add(new Mesh(geometry, material));
    const before = material.toJSON();
    prepareGarageVehiclePaint(root, model);
    assert.deepEqual(material.toJSON(), before);
    geometry.dispose(); material.dispose();
  }
});
