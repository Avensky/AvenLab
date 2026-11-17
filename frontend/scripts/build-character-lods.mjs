import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundledVesperPortrait, findVillagerModel, packedPortraitDirectory } from "./character-model-paths.mts";

async function buildCharacterLods(gender) {
  const asset = findVillagerModel(gender);
  if (!asset) return;
  const source = fileURLToPath(asset.source);
  const info = await stat(source);
  const script = await stat(fileURLToPath(import.meta.url));
  const modified = Math.max(info.mtimeMs, script.mtimeMs);
  const targets = [
    ...(gender === "male" ? [{ kind: "garage", size: 512, ratio: .65 }] : []),
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

// The full original is a fallback. Garage and portrait previews share the
// reduced textures while retaining the original female geometry and rig.
const vesper = findVillagerModel("female");
if (vesper && !vesper.sourceUrl) {
  const output = vesper.output("full");
  const temporary = fileURLToPath(output) + `.${process.pid}.tmp`;
  await mkdir(new URL(".", output), { recursive: true });
  await copyFile(vesper.source, temporary);
  await rename(temporary, output);
}
await buildCharacterLods("male");
await buildCharacterLods("female");

const previous = await readdir(packedPortraitDirectory).catch(error => {
  if (error.code !== "ENOENT") throw error;
  return [];
});
const bundled = bundledVesperPortrait(vesper);
// Take the snapshot before packing. Another build may publish a newer source while this one runs.
for (const name of previous) {
  if (name !== bundled?.name && /^vesper-[0-9a-f]{16}\.glb$/.test(name)) await rm(new URL(name, packedPortraitDirectory), { force: true });
}
if (bundled) {
  const { packPortraitGeometry } = await import("./pack-portrait-geometry.mjs");
  const packed = await packPortraitGeometry(bundled.bytes);
  if (packed) {
    await mkdir(packedPortraitDirectory, { recursive: true });
    const temporary = fileURLToPath(bundled.file) + `.${process.pid}.tmp`;
    try {
      await writeFile(temporary, packed);
      await rename(temporary, bundled.file);
    } finally {
      await rm(temporary, { force: true });
    }
    console.log(`Vesper portrait: ${bundled.bytes.length} → ${packed.length} bytes`);
  } else {
    await rm(bundled.file, { force: true });
  }
}
