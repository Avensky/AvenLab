// Bake the dedicated physics GLBs. The server can run without a frontend file tree.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { kitAssets } from "../frontend/src/worldBuilder/mapKit/catalog.ts";
import catalog from "../frontend/public/models/roads/catalog.json" with { type: "json" };
import { readGlb } from "./build-road-colliders.mjs";

const folder = new URL("../frontend/public/models/roads/", import.meta.url);
const sourceCache = new Map();
const placements = new Map(
  catalog.presets.flatMap((p) => p.placements.map((n) => [n.node, n.position])),
);
const assets = kitAssets.map((a) => {
  let raw = sourceCache.get(a.collisionFile);
  if (!raw) {
    raw = readGlb(fileURLToPath(new URL(a.collisionFile, folder))).raw;
    sourceCache.set(a.collisionFile, raw);
  }
  // readGlb applies scene transforms. A single stone module must use its inlet pivot,
  // while the assembled preset keeps every authored instance in place.
  const selected = a.node ? raw.filter((p) => p.sourceNode === a.node) : raw;
  if (!selected.length) throw Error(`Missing collider for ${a.id}`);
  const vertices = [],
    indices = [];
  for (const p of selected) {
    const base = vertices.length;
    const offset = a.node ? (placements.get(a.node) ?? [0, 0, 0]) : [0, 0, 0];
    for (let i = 0; i < p.positions.length; i += 3) {
      vertices.push(
        offset.map((v, k) => Number((p.positions[i + k] - v).toFixed(5))),
      );
    }
    for (let i = 0; i < p.indices.length; i += 3)
      indices.push(p.indices.slice(i, i + 3).map((n) => n + base));
  }
  return {
    id: "kit-" + a.id,
    size: a.size,
    permanent: a.permanent,
    lods: [],
    colliders: [{ role: "structure", vertices, indices }],
  };
});
// From above, a curve needs its actual road outline (a bounding rectangle
// incorrectly covers the open space inside a bend). The asphalt is one strip.
function pavementOutline(asset) {
  const { raw } = readGlb(fileURLToPath(new URL(asset.lodFiles[0], folder)));
  const deck = raw.find((p) => p.material === "asphalt");
  const points = new Map(),
    boundary = new Map();
  function point(i) {
    const x = Number(deck.positions[i * 3].toFixed(3)),
      z = Number(deck.positions[i * 3 + 2].toFixed(3));
    const key = x + "," + z;
    points.set(key, [x, z]);
    return key;
  }
  for (let i = 0; i < deck.indices.length; i += 3) {
    const corners = deck.indices.slice(i, i + 3).map(point);
    for (let j = 0; j < 3; j++) {
      const a = corners[j],
        b = corners[(j + 1) % 3],
        key = [a, b].sort().join("|");
      if (boundary.has(key)) boundary.delete(key);
      else boundary.set(key, [a, b]);
    }
  }
  const next = new Map(boundary.values()),
    start = next.keys().next().value,
    ring = [];
  let key = start;
  do {
    if (!next.has(key) || ring.length >= boundary.size)
      throw Error("Open road outline: " + asset.id);
    ring.push(points.get(key));
    key = next.get(key);
  } while (key !== start);
  if (ring.length !== boundary.size)
    throw Error("Disconnected road outline: " + asset.id);
  return ring;
}
const outlines = Object.fromEntries(
  kitAssets
    .filter((a) => a.id.startsWith("highway_"))
    .map((a) => ["kit-" + a.id, pavementOutline(a)]),
);
function emit(path, value) {
  const file = new URL(path, import.meta.url),
    json = JSON.stringify(value) + "\n";
  if (process.argv.includes("--check")) {
    if (fs.readFileSync(file, "utf8") !== json)
      throw Error(
        "Stale " + path + ". Run node scripts/build-map-kit-colliders.mjs",
      );
  } else fs.writeFileSync(file, json);
}
emit("../avenlab-server/src/assets/roads/map-kit-colliders.json", { assets });
emit("../frontend/src/worldBuilder/mapKit/outlines.json", outlines);
