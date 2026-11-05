// The stored city is batched by material, not by building. Recover four lots
// using the same Blender-to-runtime bounds as the physical city loader.
import {panelGeometry, wallPanels} from '../src/world/facades/wallGeometry.ts';
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, simplify, weld, draco } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import draco3d from "draco3dgltf";
import { Box3, Matrix4, Vector3 } from "three";

const source = new URL(
  "../public/models/chuncks/chunck_0,0_2x2_blocks_centered_textures512.glb",
  import.meta.url,
);
const mapFile = new URL(
  "../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json",
  import.meta.url,
);
const folder = new URL("../public/models/harbor-generated/", import.meta.url);
const output = new URL("dock-facades.glb", folder),
  stamp = new URL("build.sha256", folder);
const input = await readFile(source);
if (input.toString("ascii", 0, 4) !== "glTF")
  throw Error("Fetch the city's Git LFS model before building the harbor.");
const map = JSON.parse(await readFile(mapFile, "utf8")),
  selected = [1, 4, 7, 9].map((n) => {
    const entry = map.buildings.find(
      (b) => b.id === "block_0_0_b_0_0_building_" + n,
    );
    if (!entry) throw Error("Missing city building " + n);
    const [x, depth, y] = entry.pos,
      [hx, hz, hy] = entry.half_extents;
    return { lot:entry.id, name: "dock_facade_" + n, x, z: -depth, y, hx, hz, hy };
  });
const key = createHash("sha256")
  .update(input)
  .update(JSON.stringify(selected))
  .update(JSON.stringify(wallPanels))
  .update(await readFile(new URL("../src/world/facades/wallGeometry.ts", import.meta.url)))
  .update(await readFile(new URL(import.meta.url)))
  .digest("hex");
let cached = false;
try {
  cached =
    (await readFile(stamp, "utf8")).trim() === key &&
    (await readFile(output)).toString("ascii", 0, 4) === "glTF";
} catch {
  /* first build */
}
if (cached) {
  console.log("Harbor facade cache is current.");
} else {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });
  const doc = await io.readBinary(input),
    root = doc.getRoot(),
    originalNodes = root.listNodes().slice();
  const buffer = root.listBuffers()[0];
  const models = selected.map((b) => ({
    ...b,
    mesh: doc.createMesh(b.name),
    bounds: new Box3(),
    triangles: 0,
  }));
  for (const node of originalNodes.filter((n) =>
    n.getName().startsWith("Block_0_0__mat_"),
  )) {
    const world = new Matrix4().fromArray(node.getWorldMatrix());
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const attr = p.getAttribute("POSITION"),
        sourceIndices = p.getIndices().getArray(),
        xyz = [];
      for (let i = 0; i < attr.getCount(); i++)
        xyz.push(new Vector3(...attr.getElement(i, [])).applyMatrix4(world));
      for (const m of models) {
        const order = [],
          index = [],
          ids = new Map();
        for (let i = 0; i < sourceIndices.length; i += 3) {
          const tri = sourceIndices.subarray(i, i + 3);
          if (
            !tri.every(
              (v) =>
                Math.abs(xyz[v].x - m.x) <= m.hx + 0.6 &&
                Math.abs(xyz[v].z - m.z) <= m.hz + 0.6 &&
                Math.abs(xyz[v].y - m.y) <= m.hy + 1.0,
            )
          )
            continue;
          for (const v of tri) {
            if (!ids.has(v)) {
              ids.set(v, order.length);
              order.push(v);
              m.bounds.expandByPoint(xyz[v]);
            }
            index.push(ids.get(v));
          }
        }
        if (!index.length) continue;
        const prim = doc.createPrimitive().setMaterial(p.getMaterial());
        for (const semantic of p.listSemantics()) {
          const a = p.getAttribute(semantic),
            array = a.getArray(),
            size = a.getElementSize();
          const copy = new array.constructor(order.length * size);
          for (const [n, v] of order.entries()) {
            if (semantic === "POSITION") xyz[v].toArray(copy, n * 3);
            else copy.set(array.subarray(v * size, (v + 1) * size), n * size);
          }
          prim.setAttribute(
            semantic,
            doc
              .createAccessor()
              .setType(a.getType())
              .setNormalized(a.getNormalized())
              .setArray(copy)
              .setBuffer(buffer),
          );
        }
        prim.setIndices(
          doc
            .createAccessor()
            .setType("SCALAR")
            .setArray(new Uint32Array(index))
            .setBuffer(buffer),
        );
        m.mesh.addPrimitive(prim);
        m.triangles += index.length / 3;
      }
    }
  }
  const scene = doc.createScene("Harbor facades");
  root.setDefaultScene(scene);
  for (const m of models) {
    for (const [label, panels] of Object.entries(wallPanels[m.lot] ?? {})) {
      const material=root.listMaterials().find(mat=>mat.getName()===label);
      if(!material) throw Error("Missing facade material "+label);
      const {position,normal,uv,index}=panelGeometry(panels);
      const attr=(type,values)=>doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
      m.mesh.addPrimitive(doc.createPrimitive().setMaterial(material)
        .setAttribute("POSITION",attr("VEC3",position)).setAttribute("NORMAL",attr("VEC3",normal))
        .setAttribute("TEXCOORD_0",attr("VEC2",uv))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(index)).setBuffer(buffer)));
    }
    const extent = m.bounds.getSize(new Vector3()),
      center = m.bounds.getCenter(new Vector3());
    if (
      m.triangles < 30 ||
      extent.x < m.hx * 1.75 ||
      extent.y < m.hy * 1.75 ||
      extent.z < m.hz * 1.75
    )
      throw Error(
        m.name +
          " incomplete: " +
          m.triangles +
          " triangles; bounds " +
          extent.toArray(),
      );
    // Keep original normals, materials and UVs. The visual node normalizes the
    // source metres into a unit footprint; each placement supplies its own size.
    const node = doc
      .createNode(m.name)
      .setMesh(m.mesh)
      .setScale([1 / extent.x, 1 / extent.y, 1 / extent.z])
      .setTranslation([
        -center.x / extent.x,
        -m.bounds.min.y / extent.y,
        -center.z / extent.z,
      ]);
    scene.addChild(node);
  }
  for (const n of originalNodes) n.dispose();
  for (const s of root.listScenes().slice()) if (s !== scene) s.dispose();
  await doc.transform(prune(), weld());
  await MeshoptSimplifier.ready;
  // Allow UV-seam collapses on repetitive details while bounding the shape error.
  const facadeSimplifier = {
    simplify: (indices, positions, stride, target, error) =>
      MeshoptSimplifier.simplify(
        indices,
        positions,
        stride,
        Math.max(3, target),
        error,
        ["Permissive", "Prune"],
      ),
  };
  await doc.transform(
    simplify({ simplifier: facadeSimplifier, ratio: 0.15, error: 0.012 }),
    draco({ method: "edgebreaker" }),
  );
  await mkdir(folder, { recursive: true });
  const temporary = new URL("facades-" + process.pid + ".glb", folder);
  await io.write(fileURLToPath(temporary), doc);
  await rename(temporary, output);
  await writeFile(stamp, key + "\n");
  console.log(
    "Baked harbor facades",
    models.map((m) => [m.name, m.triangles]),
    (await readFile(output)).length,
    "bytes",
  );
}
