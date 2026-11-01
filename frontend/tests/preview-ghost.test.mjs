import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshBasicMaterial, BoxGeometry } from "three";
import {
  previewMaterialState,
  setPreviewGhost,
} from "../src/game/preview/previewGhost.ts";

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
