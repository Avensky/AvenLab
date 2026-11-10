import { rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = new URL("../public/models/characters/", import.meta.url);
async function buildCharacterLods(character) {
  const file = name => fileURLToPath(new URL(character + name + ".glb", directory));
  const source = file("");
  const info = await stat(source).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  // Clean checkouts without downloaded Git LFS objects contain small text pointers.
  if (!info || info.size < 256) return;
  const script = await stat(fileURLToPath(import.meta.url));
  const modified = Math.max(info.mtimeMs, script.mtimeMs);
  const targets = [
    { name: ".garage", size: 512, ratio: .65 },
    { name: ".portrait", size: 768 },
  ];
  const pending = [];
  for (const target of targets) {
    const output = await stat(file(target.name)).catch(error => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (!output || output.mtimeMs < modified) pending.push(target);
  }
  if (pending.length) {
    const [{ NodeIO }, { ALL_EXTENSIONS }, { prune, simplify, textureCompress }, { MeshoptSimplifier }, { default: sharp }] = await Promise.all([
      import("@gltf-transform/core"), import("@gltf-transform/extensions"), import("@gltf-transform/functions"),
      import("meshoptimizer"), import("sharp"),
    ]);
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    await MeshoptSimplifier.ready;
    for (const target of pending) {
      const doc = await io.read(source);
      if (target.ratio) await doc.transform(
        prune({ keepLeaves: true }),
        simplify({ simplifier: MeshoptSimplifier, ratio: target.ratio, error: .001, lockBorder: true }),
      );
      await doc.transform(textureCompress({
        encoder: sharp, resize: [target.size, target.size], targetFormat: "webp", quality: 86,
      }));
      const output = file(target.name), temporary = output + ".tmp.glb";
      await io.write(temporary, doc);
      await rename(temporary, output);
      console.log(`${character} ${target.name.slice(1)} LOD: ${((await stat(output)).size / 1048576).toFixed(1)} MiB`);
    }
  }
}

for (const character of ["villager-female", "villager-male"]) await buildCharacterLods(character);
