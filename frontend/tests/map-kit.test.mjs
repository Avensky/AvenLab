import test from "node:test";
import assert from "node:assert/strict";
import {
  addPiece,
  emptyLayout,
  parseLayout,
  pieceById,
} from "../src/worldBuilder/document/layoutDocument.ts";
import { snapLayoutPosition } from "../src/worldBuilder/roads/layoutSnapping.ts";
import { kitAssets } from "../src/worldBuilder/mapKit/catalog.ts";
import { worldSocket } from "../src/worldBuilder/mapKit/sockets.ts";
import { harborCanal } from "../src/worldBuilder/generation/harborCanal.ts";
import { destructionDefaults } from "../src/combat/destruction.ts";
import { portraitSource } from "../src/worldBuilder/components/prefabPortraits.ts";
import { isHighwayBorderMaterial } from "../src/worldBuilder/mapKit/materials.ts";

test("the prefab library resolves distinct 3D portraits from the actual model files", () => {
  const straight = portraitSource(pieceById("kit-highway_25_wide_straight_level"));
  const bend = portraitSource(pieceById("kit-highway_26_wide_bend44_level"));
  const stone = portraitSource(pieceById("kit-stone_bridge_120m"));
  assert.match(straight.url, /highway_25.*lod0\.glb$/);
  assert.match(bend.url, /highway_26.*lod0\.glb$/);
  assert.notEqual(straight.url, bend.url);
  assert.match(stone.url, /stone_bridge.*lod0\.glb$/);
  assert.equal(portraitSource(pieceById("tower")), null);
});

test("connector rail finishes are shared without recoloring stone masonry", () => {
  assert(isHighwayBorderMaterial("guardrail_section", "mat_01"));
  assert(isHighwayBorderMaterial("part_03", "metal"));
  assert(!isHighwayBorderMaterial("road_asphalt", "asphalt"));
  assert(!isHighwayBorderMaterial("stone_wall", "concrete"));
});

test("every kit asset places, round-trips and uses only its dedicated collider", () => {
  assert.equal(kitAssets.length, 34);
  for (const asset of kitAssets) {
    const id = "kit-" + asset.id;
    assert.equal(pieceById(id).category, "roads");
    const doc = addPiece(emptyLayout("test"), id, [3, 5, -7], 40);
    assert.deepEqual(parseLayout(JSON.parse(JSON.stringify(doc))), doc);
    assert.equal(doc.ground, false);
    assert.deepEqual(doc.objects[0].parts, []);
    if (asset.permanent) {
      doc.objects[0].destruction = { ...destructionDefaults, enabled: true };
      assert.throws(() => parseLayout(doc), /Permanent/);
    }
  }
});

test("socket snapping aligns rotated, raised and resized road seams", () => {
  const road = kitAssets.find((a) => a.id === "highway_33_wide_bend45_rise10");
  const straight = kitAssets.find(
    (a) => a.id === "highway_25_wide_straight_level",
  );
  const fixed = addPiece(emptyLayout("test"), "kit-" + road.id, [21, 4, -7], 28)
    .objects[0];
  fixed.size[1] *= 1.2;
  const exit = worldSocket(fixed, road, road.sockets[1]);
  const next = addPiece(emptyLayout("test"), "kit-" + straight.id, [0, 0, 0], 0)
    .objects[0];
  const desired = [exit.position[0] + 0.5, 0, exit.position[2] - 0.4];
  const pose = snapLayoutPosition(next, desired, [fixed], "outer", 2);
  assert.equal(pose.lock?.lock.kind, "socket");
  const inlet = worldSocket(
    { ...next, ...pose },
    straight,
    straight.sockets[0],
  );
  assert(
    Math.hypot(...inlet.position.map((v, i) => v - exit.position[i])) < 1e-5,
  );
  assert(Math.abs(inlet.heading - exit.heading) < 0.001);
  const narrow = addPiece(
    emptyLayout("test"),
    "kit-highway_44_narrow_straight_level",
    desired,
  ).objects[0];
  assert.equal(
    snapLayoutPosition(narrow, desired, [fixed], "outer", 2).lock,
    null,
  );
});

test("all three harbor variants use stone spans and a highway approach on both banks", () => {
  for (const plan of ["red", "blue", "fleet"]) {
    const objects = harborCanal(plan, 19).authored_layout.objects;
    const stone = objects.filter(
      (o) => o.piece === "kit-stone_start" || o.piece === "kit-stone_end",
    );
    assert.equal(stone.length, 2);
    assert.deepEqual(
      stone.map((o) => o.position),
      [
        [-30, 0.09, -178],
        [0, 0.09, -178],
      ],
    );
    assert.equal(
      objects.filter((o) => o.id.startsWith("kit-approach-") && o.piece === "kit-highway_25_wide_straight_level")
        .length,
      2,
    );
    assert(!objects.some((o) => o.piece === "coastal-land-bridge"));
    assert(
      objects.some(
        (o) => o.piece === "canal-breakable" && o.destruction.enabled,
      ),
    );
  }
});
