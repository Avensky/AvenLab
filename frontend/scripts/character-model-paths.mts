import { readFileSync, statSync } from "node:fs";

const publicRoot = new URL("../public/", import.meta.url);
const sourceRoot = new URL("../src/public/", import.meta.url);
const characterPath = "models/characters/";
const villagerPath = characterPath + "villager/";
type CharacterModelKind = "garage" | "portrait" | "full";

export function hasCharacterModel(path: URL) {
  // A Git LFS pointer is a short text file. It cannot be parsed as a GLB.
  const info = statSync(path, { throwIfNoEntry: false });
  return Boolean(info?.isFile() && info.size >= 256);
}

function garmentJointNames(path: URL) {
  if (!hasCharacterModel(path)) return;
  try {
    const bytes = readFileSync(path);
    const jsonEnd = 20 + bytes.readUInt32LE(12);
    if (bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2
      || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || jsonEnd > bytes.length) return;
    const model: {
      nodes: { name?: string; mesh?: number; skin?: number }[];
      skins: { joints: number[]; inverseBindMatrices?: number }[];
      meshes: { primitives: { attributes: Record<string, number> }[] }[];
    } = JSON.parse(bytes.toString("utf8", 20, jsonEnd));
    const rigs = model.nodes.filter(node => node.mesh !== undefined).map(({ mesh, skin }) => {
      const primitives = mesh === undefined ? undefined : model.meshes[mesh]?.primitives;
      const rig = skin === undefined ? undefined : model.skins?.[skin];
      if (!rig || rig.inverseBindMatrices === undefined || !primitives?.length || primitives.some(({ attributes }) =>
        attributes.POSITION === undefined || attributes.JOINTS_0 === undefined || attributes.WEIGHTS_0 === undefined)) return;
      return rig.joints.map(joint => model.nodes[joint]?.name);
    });
    const first = rigs[0];
    if (first?.length && first.every(Boolean) && rigs.every(rig => rig?.length === first.length
      && rig.every((joint, i) => joint === first[i]))) return first;
  } catch {
    // A revision can be missing its rig or be an incomplete export.
  }
}

export function hasCompatibleWardrobeRevision(revision: URL, original: URL) {
  const updated = garmentJointNames(revision);
  if (!updated) return false;
  const expected = garmentJointNames(original);
  return Boolean(expected?.length === updated.length && updated.every((joint, i) => joint === expected[i]));
}

export function findVillagerModel(gender: "female" | "male") {
  const nestedNames = [`village-${gender}`, `villager-${gender}`];
  const bundledBase = `${characterPath}villagers/villager-${gender}/villager-${gender}`;
  const sources = [
    ...nestedNames.map(name => ({ root: sourceRoot, base: villagerPath + name })),
    { root: publicRoot, base: bundledBase },
    ...nestedNames.map(name => ({ root: publicRoot, base: villagerPath + name })),
    { root: publicRoot, base: characterPath + `villager-${gender}` },
  ];
  for (const { root, base } of sources) {
    const source = new URL(base + ".glb", root);
    if (!hasCharacterModel(source)) continue;
    const outputBase = base === bundledBase ? `${villagerPath}villager-${gender}` : base;
    return {
      source,
      output: (kind: CharacterModelKind) => new URL(`${outputBase}.${kind}.glb`, publicRoot),
      url: (kind: CharacterModelKind) => `/${outputBase}.${kind}.glb`,
      sourceUrl: root === publicRoot ? `/${base}.glb` : null,
      bundledLod: (kind: "garage" | "portrait") => {
        const path = `${base}.${kind}.glb`;
        return base === bundledBase && hasCharacterModel(new URL(path, publicRoot)) ? `/${path}` : null;
      },
    };
  }
  return null;
}
