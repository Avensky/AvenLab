import { statSync } from "node:fs";

const publicRoot = new URL("../public/", import.meta.url);
const sourceRoot = new URL("../src/public/", import.meta.url);
const characterPath = "models/characters/";
const villagerPath = characterPath + "villager/";

export function hasCharacterModel(path: URL) {
  // A Git LFS pointer is a short text file. It cannot be parsed as a GLB.
  const info = statSync(path, { throwIfNoEntry: false });
  return Boolean(info?.isFile() && info.size >= 256);
}

export function findVillagerModel(gender: "female" | "male") {
  const nestedNames = [`village-${gender}`, `villager-${gender}`];
  const sources = [
    ...nestedNames.map(name => ({ root: sourceRoot, base: villagerPath + name })),
    ...nestedNames.map(name => ({ root: publicRoot, base: villagerPath + name })),
    { root: publicRoot, base: characterPath + `villager-${gender}` },
  ];
  for (const { root, base } of sources) {
    const source = new URL(base + ".glb", root);
    if (!hasCharacterModel(source)) continue;
    return {
      source,
      output: (kind: "garage" | "portrait") => new URL(`${base}.${kind}.glb`, publicRoot),
      url: (kind: "garage" | "portrait") => `/${base}.${kind}.glb`,
      sourceUrl: root === publicRoot ? `/${base}.glb` : null,
    };
  }
  return null;
}
