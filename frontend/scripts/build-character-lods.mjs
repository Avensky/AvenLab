import { copyFile, mkdir, rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { findVillagerModel } from "./character-model-paths.mts";

async function buildCharacterLods(gender) {
  const asset = findVillagerModel(gender);
  if (!asset) return;
  const source = fileURLToPath(asset.source);
  const info = await stat(source);
  const script = await stat(fileURLToPath(import.meta.url));
  const modified = Math.max(info.mtimeMs, script.mtimeMs);
  const targets = [
    { kind: "garage", size: 512, ratio: .65 },
    { kind: "portrait", size: 768 },
  ];
  const pending = [];
  for (const target of targets) {
    if (asset.bundledLod(target.kind)) continue;
    const output = await stat(asset.output(target.kind)).catch(error => {
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
    await mkdir(new URL(".", asset.output("garage")), { recursive: true });
    for (const target of pending) {
      const doc = await io.read(source);
      if (target.ratio) await doc.transform(
        prune({ keepLeaves: true }),
        simplify({ simplifier: MeshoptSimplifier, ratio: target.ratio, error: .001, lockBorder: true }),
      );
      await doc.transform(textureCompress({
        encoder: sharp, resize: [target.size, target.size], targetFormat: "webp", quality: 86,
      }));
      const output = fileURLToPath(asset.output(target.kind)), temporary = output + ".tmp.glb";
      await io.write(temporary, doc);
      await rename(temporary, output);
      console.log(`Villager ${gender} ${target.kind} LOD: ${((await stat(output)).size / 1048576).toFixed(1)} MiB`);
    }
  }
}

// Vesper shares the original GLB between the garage and the portrait. Sources
// under src/public need to be copied into Vite's public directory verbatim.
const vesper = findVillagerModel("female");
if (vesper && !vesper.sourceUrl) {
  const output = vesper.output("full");
  const temporary = fileURLToPath(output) + `.${process.pid}.tmp`;
  await mkdir(new URL(".", output), { recursive: true });
  await copyFile(vesper.source, temporary);
  await rename(temporary, output);
}
await buildCharacterLods("male");
