import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { discoverWardrobeGarments } from "../scripts/discover-wardrobe-garments.mts";

const rig = JSON.parse(await readFile(new URL("./fixtures/villager-female-rig.json", import.meta.url), "utf8"));

function testGlb({ name = "CLOTH_TOP_DEMO", jointOrder = rig.skins[0].joints, invalidImage = false, invalidPrimitive = false, resizedRig = false } = {}) {
  const nodes = [...rig.nodes, { name, mesh: 0, skin: 0 }];
  if (resizedRig) nodes[jointOrder[0]] = { ...nodes[jointOrder[0]], scale: [1, 1.2, 1] };
  const model = {
    asset: { version: "2.0" }, nodes,
    skins: [{ joints: jointOrder, inverseBindMatrices: 3 }],
    meshes: [{ primitives: [invalidPrimitive ? null : { attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteLength: 4 }],
    ...(invalidImage ? { images: [{ uri: "https://example.invalid/diffuse.png" }] } : {}),
    accessors: [{ count: 3 }, { count: 3 }, { count: 3 }, { type: "MAT4", componentType: 5126, count: jointOrder.length }],
  };
  const json = Buffer.from(JSON.stringify(model));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const file = Buffer.alloc(paddedLength + 32);
  file.write("glTF", 0);
  file.writeUInt32LE(2, 4);
  file.writeUInt32LE(file.length, 8);
  file.writeUInt32LE(paddedLength, 12);
  file.writeUInt32LE(0x4e4f534a, 16);
  file.fill(" ", 20, 20 + paddedLength);
  json.copy(file, 20);
  file.writeUInt32LE(4, 20 + paddedLength);
  file.writeUInt32LE(0x004e4942, 24 + paddedLength);
  return file;
}

test("wardrobe discovery merges valid tiers and skips LFS placeholders, misplaced and curated assets", async t => {
  const publicRoot = await mkdtemp(join(tmpdir(), "avenlab-wardrobe-"));
  t.after(() => rm(publicRoot, { recursive: true, force: true }));
  const wardrobe = join(publicRoot, "models/characters/female/wardrobe");
  const tops = join(wardrobe, "tops");
  const skirts = join(wardrobe, "skirts/gothic-skirt");
  await Promise.all([mkdir(tops, { recursive: true }), mkdir(skirts, { recursive: true })]);
  await Promise.all([
    writeFile(join(tops, "demo-top.garage.glb"), testGlb()),
    writeFile(join(tops, "demo-top.mobile.glb"), testGlb()),
    writeFile(join(tops, "travel-top.mobile.glb"), testGlb()),
    writeFile(join(tops, "preview-top-preview.glb"), testGlb()),
    writeFile(join(tops, "curated-top.glb"), testGlb()),
    writeFile(join(tops, "retired-top.glb"), testGlb()),
    writeFile(join(tops, "broken-top.glb"), "version https://git-lfs.github.com/spec/v1\n"),
    writeFile(join(tops, "null-primitive.glb"), testGlb({ invalidPrimitive: true })),
    writeFile(join(tops, "external-images.glb"), testGlb({ invalidImage: true })),
    writeFile(join(tops, "wrong-rig.glb"), testGlb({ jointOrder: [...rig.skins[0].joints].reverse() })),
    writeFile(join(tops, "resized-rig.glb"), testGlb({ resizedRig: true })),
    writeFile(join(skirts, "misfiled-top.glb"), testGlb()),
    writeFile(join(skirts, "jacquard-skirt.glb"), testGlb({ name: "CLOTH_GOTHIC_SKIRT_JACQUARD" })),
  ]);
  await symlink(join(tops, "demo-top.garage.glb"), join(tops, "linked.glb"), "file").catch(error => {
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
  });
  const catalog = [
    { id: "existing-style", url: "/models/characters/female/wardrobe/tops/curated-top.garage.glb" },
    { id: "removed-style", url: "/models/characters/female/wardrobe/tops/retired-top.glb" },
  ];
  const [paired, mobileOnly, skirt, ...extra] = discoverWardrobeGarments(pathToFileURL(`${publicRoot}/`), catalog);
  assert.equal(extra.length, 0);
  assert.deepEqual(paired, {
    id: "auto-tops-demo-top", label: "Demo Top", section: "Tops", category: "tops", slot: "top", piece: "shirt",
    url: "/models/characters/female/wardrobe/tops/demo-top.garage.glb",
    mobileUrl: "/models/characters/female/wardrobe/tops/demo-top.mobile.glb",
  });
  assert.equal(mobileOnly.url, "/models/characters/female/wardrobe/tops/travel-top.mobile.glb");
  assert.equal(skirt.id, "auto-gothic-skirts-jacquard-skirt");
  assert.equal(skirt.slot, "skirt");
});
