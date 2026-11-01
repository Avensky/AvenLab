import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshBasicMaterial, BoxGeometry } from "three";
import {
  previewMaterialState,
  setPreviewGhost,
} from "../src/game/preview/previewGhost.ts";
import { prepareVehicleVisual } from "../src/vehicles/tools/vehicleMaterials.ts";

test("an unpicked preview dims only its owned materials and restores authored glass exactly", () => {
  const cached = new MeshBasicMaterial({
    opacity: 0.6,
    transparent: true,
    depthWrite: false,
  });
  const glass = cached.clone(),
    body = new MeshBasicMaterial();
  const model = new Group(),
    geometry = new BoxGeometry();
  model.add(new Mesh(geometry, [body, glass]), new Mesh(geometry, body));
  const saved = previewMaterialState(model);
  assert.equal(saved.size, 2, "shared materials are visited once");
  setPreviewGhost(saved, true);
  assert.equal(body.opacity, 0.23);
  assert.equal(glass.opacity, 0.6 * 0.23);
  assert.equal(cached.opacity, 0.6, "cached GLB state remains untouched");
  setPreviewGhost(saved, true);
  assert.equal(
    body.opacity,
    0.23,
    "repeated state cannot keep fading the model",
  );
  setPreviewGhost(saved, false);
  assert.deepEqual(
    [body.opacity, body.transparent, body.depthWrite],
    [1, false, true],
  );
  assert.deepEqual(
    [glass.opacity, glass.transparent, glass.depthWrite],
    [0.6, true, false],
  );
  geometry.dispose();
  cached.dispose();
  glass.dispose();
  body.dispose();
});

test("BRZ, AE86 and Tank ghosts cannot contaminate later full previews or gameplay", () => {
  for (const model of ["brz", "ae86", "tank"]) {
    const cached = new Group(),
      geometry = new BoxGeometry();
    const body = new MeshBasicMaterial(),
      glass = new MeshBasicMaterial({
        opacity: 0.4,
        transparent: true,
        depthWrite: false,
      });
    cached.add(new Mesh(geometry, [body, glass]), new Mesh(geometry, body));
    const ghost = prepareVehicleVisual(cached, model);
    setPreviewGhost(previewMaterialState(ghost.root), true);
    assert.equal(body.opacity, 1, model + " source body stays opaque");
    assert.equal(glass.opacity, 0.4);
    const full = prepareVehicleVisual(cached, model),
      runtime = prepareVehicleVisual(cached, model);
    assert.equal(full.root.children[0].material[0].opacity, 1);
    assert.equal(runtime.root.children[0].material[0].opacity, 1);
    assert.equal(
      full.root.children[0].material[1].opacity,
      0.4,
      "authored glass remains glass",
    );
    assert.notEqual(
      full.root.children[0].material[0],
      runtime.root.children[0].material[0],
    );
    ghost.dispose();
    full.dispose();
    runtime.dispose();
    geometry.dispose();
    body.dispose();
    glass.dispose();
  }
});
