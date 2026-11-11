import { SkinnedMesh, type BufferGeometry, type Object3D } from "three";

/** The vest export combines broad lining panels and narrow piping in one material. */
function splitVestLining(geometry: BufferGeometry) {
  const index = geometry.getIndex(), uv = geometry.getAttribute("uv");
  if (!index || !uv) return;
  const { start, count } = geometry.drawRange;
  const end = Math.min(start + count, index.count);
  const parents = Uint32Array.from({ length: uv.count }, (_, vertex) => vertex);
  const island = (vertex: number) => {
    while (parents[vertex] !== vertex) {
      parents[vertex] = parents[parents[vertex]];
      vertex = parents[vertex];
    }
    return vertex;
  };
  for (let i = start; i < end; i += 3) {
    const first = island(index.getX(i));
    parents[island(index.getX(i + 1))] = first;
    parents[island(index.getX(i + 2))] = first;
  }
  const bounds = new Map<number, { min: number; max: number }>();
  for (let i = start; i < end; i++) {
    const vertex = index.getX(i), component = island(vertex), u = uv.getX(vertex);
    const span = bounds.get(component);
    if (span) {
      span.min = Math.min(span.min, u);
      span.max = Math.max(span.max, u);
    } else bounds.set(component, { min: u, max: u });
  }

  const lining: number[] = [], piping: number[] = [];
  const crownStart = geometry.userData.underbustCrownStart ?? Infinity;
  for (let i = start; i < end; i += 3) {
    const first = index.getX(i);
    const { min, max } = bounds.get(island(first))!;
    // The three wide lining islands are on the right side of both vest UV atlases.
    const layer = first < crownStart && min > .60 && max - min >= .20 ? lining : piping;
    layer.push(first, index.getX(i + 1), index.getX(i + 2));
  }
  if (lining.length && piping.length) return { lining, piping };
}

export function prepareUnderbustColors(root: Object3D) {
  const splits: { mesh: SkinnedMesh; source: BufferGeometry; lining: SkinnedMesh }[] = [];
  const plackets: { mesh: SkinnedMesh; material: SkinnedMesh["material"] }[] = [];
  for (const fit of ["TUCKED", "OVER"]) {
    const vest = root.getObjectByName(`CLOTH_CORSET_${fit}`);
    if (!vest) continue;
    let mesh: SkinnedMesh | undefined, fabric: SkinnedMesh | undefined, placket: SkinnedMesh | undefined;
    vest.traverse(part => {
      if (!(part instanceof SkinnedMesh) || Array.isArray(part.material)) return;
      if (part.material.name === "MAT_CORSET_04_00.001") mesh = part;
      if (part.material.name === "MAT_CORSET_04_04.001") placket = part;
      if (part.material.name === "MAT_CORSET_04_05.001") fabric = part;
    });
    if (!mesh || !fabric) continue;
    // The broad center panel is cloth. Its piping and clasps are separate faces.
    if (placket) {
      plackets.push({ mesh: placket, material: placket.material });
      placket.material = fabric.material;
    }
    const source = mesh.geometry, partition = splitVestLining(source);
    if (!partition) continue;

    const lining = mesh.clone(false);
    lining.name = `CLOTH_CORSET_04_LINING_${fit}`;
    lining.material = fabric.material;
    lining.geometry = source.clone().setIndex(partition.lining);
    lining.geometry.setDrawRange(0, partition.lining.length);
    mesh.geometry = source.clone().setIndex(partition.piping);
    mesh.geometry.setDrawRange(0, partition.piping.length);
    mesh.parent?.add(lining);
    splits.push({ mesh, source, lining });
  }
  return () => {
    for (const { mesh, material } of plackets) mesh.material = material;
    for (const { mesh, source, lining } of splits) {
      mesh.geometry.dispose();
      mesh.geometry = source;
      lining.removeFromParent();
      lining.geometry.dispose();
    }
  };
}
