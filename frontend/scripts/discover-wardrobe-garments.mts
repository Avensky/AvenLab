import { closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directory = "models/characters/female/wardrobe/";
export const wardrobePublicRoot = new URL("../public/", import.meta.url);
export const wardrobeDirectory = new URL(directory, wardrobePublicRoot);
export const wardrobeCatalogFile = new URL("../../avenlab-server/src/assets/character-garments.json", import.meta.url);
const femaleRig = new URL("../tests/fixtures/villager-female-rig.json", import.meta.url);
type CuratedGarment = { id: string; url: string; mobileUrl?: string; revisionUrl?: string };
type GarmentSlot = "top" | "skirt" | "dress" | "coat" | "hat" | "socks" | "bow" | "harness" | "bracer";
export type DiscoveredWardrobeGarment = CuratedGarment & {
  label: string; section: string; category: string; slot: GarmentSlot; piece: GarmentSlot | "shirt" | "armor";
};
type RigNode = {
  name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[];
};
type Glb = {
  asset?: { version?: string };
  nodes?: (RigNode & { mesh?: number; skin?: number; extras?: { clothingPiece?: string } })[];
  meshes?: { primitives?: { attributes?: Record<string, number> }[] }[];
  skins?: { inverseBindMatrices?: number; joints?: number[] }[];
  accessors?: { type?: string; componentType?: number; count: number }[];
  buffers?: { uri?: string; byteLength: number }[];
  images?: { uri?: string; bufferView?: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
};
const families = [
  ["tops", "tops", "Tops", "tops", "top", "shirt", /^(?:CLOTH_(?:TOP|SHIRT|ARMS)_|TOP_|SHIRT_)/],
  ["skirts", "skirts", "Skirts", "bottoms", "skirt", "skirt", /^(?:CLOTH_(?:SKIRT|BOTTOM|UNDER)_|SKIRT_)/],
  ["skirts/gothic-skirt", "gothic-skirts", "Gothic skirts", "bottoms", "skirt", "skirt", /^CLOTH_GOTHIC_SKIRT_/],
  ["dress", "dresses", "Dresses", "outfits", "dress", "dress", /^(?:CLOTH_(?:DRESS|MEDIEVAL)_|DRESS_|OUTFIT_)/],
  ["Sleepwear", "sleepwear", "Sleepwear", "outfits", "dress", "dress", /^(?:CLOTH_(?:DRESS|NIGHTGOWN)_|LINEN_NIGHTGOWN_|SLEEPWEAR_)/],
  ["kaftan", "kaftans", "Medieval kaftans", "outfits", "dress", "dress", /^CLOTH_KAFTAN_/],
  ["coat", "coats", "Coats", "outfits", "coat", "coat", /^(?:CLOTH_(?:TOP_)?COAT_|COAT_)/],
  ["armor", "armor", "Armor", "tops", "top", "armor", /^CLOTH_ARMOR_/],
  ["hats", "hats", "Hats", "headwear", "hat", "hat", /^(?:ACC_HAT_|CLOTH_(?:HAT|HOOD)_|HAT_)/],
  ["hoods", "hoods", "Medieval hoods", "headwear", "hat", "hat", /^CLOTH_HOOD_/],
  ["socks", "socks", "Socks", "footwear", "socks", "socks", /^CLOTH_SOCKS?_/],
  ["bowties", "bowties", "Bow ties", "bows", "bow", "bow", /^(?:CLOTH_BOW(?:TIE)?_|ACC_BOW_|BOWTIE_)/],
  ["harness", "harnesses", "Harnesses", "accessories", "harness", "harness", /^(?:CLOTH_HARNESS_|HARNESS_)/],
  ["bracers", "bracers", "Bracers", "accessories", "bracer", "bracer", /^CLOTH_BRACER_/],
] as const;
const filenamePattern = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.(garage|mobile))?\.glb$/;

function readGlbJson(file: URL): Glb | undefined {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(file, "r");
    const header = Buffer.alloc(20);
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length
      || header.toString("ascii", 0, 4) !== "glTF" || header.readUInt32LE(4) !== 2
      || header.readUInt32LE(8) !== fstatSync(descriptor).size || header.readUInt32LE(16) !== 0x4e4f534a) return;
    const jsonSize = header.readUInt32LE(12);
    if (jsonSize > 8 * 1024 * 1024 || jsonSize + header.length + 8 >= header.readUInt32LE(8)) return;
    const bytes = Buffer.alloc(jsonSize);
    if (readSync(descriptor, bytes, 0, bytes.length, header.length) !== bytes.length) return;
    const bin = Buffer.alloc(8);
    if (readSync(descriptor, bin, 0, bin.length, header.length + jsonSize) !== bin.length
      || bin.readUInt32LE(4) !== 0x004e4942 || header.length + jsonSize + bin.length + bin.readUInt32LE(0) !== header.readUInt32LE(8)) return;
    const model: Glb | null = JSON.parse(bytes.toString("utf8"));
    const buffer = Array.isArray(model?.buffers) && model.buffers.length === 1 ? model.buffers[0] : undefined;
    if (!buffer || buffer.uri !== undefined || !Number.isInteger(buffer.byteLength) || buffer.byteLength <= 0
      || buffer.byteLength > bin.readUInt32LE(0)) return;
    if (!Array.isArray(model?.bufferViews) || model.bufferViews.some(view => {
      const offset = view?.byteOffset ?? 0;
      return !view || view.buffer !== 0 || !Number.isInteger(offset) || offset < 0
        || !Number.isInteger(view.byteLength) || view.byteLength <= 0 || offset + view.byteLength > buffer.byteLength;
    })) return;
    if (model.images !== undefined && (!Array.isArray(model.images) || model.images.some(image =>
      !image || image.uri !== undefined || !model.bufferViews?.[image.bufferView ?? -1]))) return;
    return model;
  } catch {
    // Ignore LFS pointers, malformed exports, and files still being copied.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parentNames(nodes: readonly RigNode[]) {
  const parents = new Map<number, string | undefined>();
  for (const node of nodes) if (Array.isArray(node?.children)) {
    for (const child of node.children) parents.set(child, node.name);
  }
  return parents;
}

function hasCompatibleBind(node: RigNode | undefined, expected: RigNode) {
  if (!node || node.name !== expected.name || node.matrix !== undefined || expected.matrix !== undefined) return false;
  const keys = ["translation", "rotation", "scale"] as const;
  const defaults = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  return keys.every(key => {
    const target = expected[key] ?? defaults[key];
    const value = node[key] ?? defaults[key];
    if (!Array.isArray(value) || value.length !== target.length || !value.every(Number.isFinite)) return false;
    const rotationSign = key === "rotation" && value.reduce((sum, item, index) => sum + item * target[index], 0) < 0 ? -1 : 1;
    // Blender re-exports perturb the local transforms by roughly 1e-5.
    return value.every((number, index) => Math.abs(number * rotationSign - target[index]) <= .00002);
  });
}

function compatibleGarment(file: URL, expectedRig: readonly { node: RigNode; parent: string | undefined }[], piece: string, nodePattern: RegExp) {
  const model = readGlbJson(file);
  if (!Array.isArray(model?.nodes) || !Array.isArray(model.meshes) || !Array.isArray(model.skins)
    || !Array.isArray(model.accessors) || model.asset?.version !== "2.0") return false;
  const { nodes, skins, meshes, accessors } = model;
  const geometry = nodes.filter(node => node?.mesh !== undefined);
  const parents = parentNames(nodes);
  return geometry.length > 0 && geometry.every(node => {
    const skin = skins[node.skin ?? -1];
    const primitives = meshes[node.mesh ?? -1]?.primitives;
    const bind = accessors[skin?.inverseBindMatrices ?? -1];
    return (node.extras?.clothingPiece === piece || nodePattern.test(node.name ?? ""))
      && bind?.type === "MAT4" && bind.componentType === 5126 && bind.count === expectedRig.length
      && Array.isArray(skin?.joints) && skin.joints.length === expectedRig.length
      && skin.joints.every((joint, index) => parents.get(joint) === expectedRig[index].parent
        && hasCompatibleBind(nodes[joint], expectedRig[index].node))
      && Array.isArray(primitives) && primitives.length > 0 && primitives.every(primitive =>
        ["POSITION", "JOINTS_0", "WEIGHTS_0"].every(attribute => (accessors[primitive?.attributes?.[attribute] ?? -1]?.count ?? 0) > 0));
  });
}

/** Curated exports, retired pieces, and legacy copies own their existing names. */
export function discoverWardrobeGarments(publicRoot = wardrobePublicRoot,
  catalog: readonly CuratedGarment[] = JSON.parse(readFileSync(wardrobeCatalogFile, "utf8"))): DiscoveredWardrobeGarment[] {
  const rig: { nodes: RigNode[]; skins: { joints: number[] }[] } = JSON.parse(readFileSync(femaleRig, "utf8"));
  const rigParents = parentNames(rig.nodes);
  const expectedRig = rig.skins[0].joints.map(index => ({ node: rig.nodes[index], parent: rigParents.get(index) }));
  const curatedStems = new Set(catalog.flatMap(({ url, mobileUrl, revisionUrl }) => [url, mobileUrl, revisionUrl]
    .map(path => filenamePattern.exec(path?.split("/").at(-1) ?? "")?.[1])));
  const ids = new Set(catalog.map(({ id }) => id));
  const discovered: DiscoveredWardrobeGarment[] = [];
  const canonicalRoot = realpathSync(publicRoot);
  for (const [folder, family, section, category, slot, piece, pattern] of families) {
    const models = new URL(`${directory}${folder}/`, publicRoot);
    let entries;
    try {
      // A loose model belongs to the matching catalog folder in this checkout.
      const modelPath = fileURLToPath(models).replace(/[\\/]$/, "");
      if (!lstatSync(modelPath).isDirectory() || realpathSync(modelPath) !== resolve(canonicalRoot, directory, folder)) continue;
      entries = readdirSync(models, { withFileTypes: true });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      continue;
    }
    const tiers = new Map<string, Partial<Record<"plain" | "garage" | "mobile", string>>>();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = filenamePattern.exec(entry.name);
      if (!name) continue;
      const [, stem, mode] = name;
      const tier = mode === "garage" || mode === "mobile" ? mode : "plain";
      if (curatedStems.has(stem) || stem.length > 56 || /-(?:update|revision|preview|test)$/.test(stem)) continue;
      const assets = tiers.get(stem) ?? {};
      assets[tier] = entry.name;
      tiers.set(stem, assets);
    }
    for (const [stem, { plain, garage, mobile }] of [...tiers].sort(([first], [second]) => first.localeCompare(second, "en"))) {
      const id = `auto-${family}-${stem}`;
      if (ids.has(stem) || ids.has(id)) continue;
      const valid = (file?: string) => Boolean(file && compatibleGarment(new URL(file, models), expectedRig, piece, pattern));
      const main = [garage, plain, mobile].find(valid);
      if (!main) continue;
      const mobileName = mobile !== main && valid(mobile) ? mobile : undefined;
      const url = `/${directory}${folder}/${main}`;
      const label = stem.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
      discovered.push({ id, label, section, category, slot, piece, url,
        ...(mobileName ? { mobileUrl: `/${directory}${folder}/${mobileName}` } : {}) });
      ids.add(id);
    }
  }
  return discovered;
}

export function isWardrobeCatalogInput(file: string) {
  const path = pathToFileURL(file).href;
  return path === wardrobeCatalogFile.href || (path.startsWith(wardrobeDirectory.href) && path.endsWith(".glb"));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(JSON.stringify(discoverWardrobeGarments()));
}
