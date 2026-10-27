import { BatchedMesh, InstancedMesh, Matrix4, MeshPhysicalMaterial } from "three";

export type CityRenderMesh = InstancedMesh | BatchedMesh;
export type CityDrawBinding = { mesh: BatchedMesh; ids: number[]; count: number };
export type CityDrawPart = { mesh: InstancedMesh; binding?: CityDrawBinding; reduced: boolean; castsShadow: boolean };

// A different-geometry batch is worthwhile only with native multi-draw. Three's
// compatibility path would issue a separate draw for every repeated placement.
// Leave transparent surfaces instanced so their existing sort order is preserved.
export function cityDrawBatchJobs(parts: CityDrawPart[], capacity: number, attach: (mesh: BatchedMesh) => void) {
  const groups = new Map<string, CityDrawPart[]>();
  for (const part of parts) {
    const { mesh } = part, material = mesh.material;
    if (part.binding || Array.isArray(material) || material.transparent || ("wireframe" in material && material.wireframe)
      || (material instanceof MeshPhysicalMaterial && material.transmission > 0)
      || Object.keys(mesh.geometry.morphAttributes).length || mesh.geometry.drawRange.start !== 0
      || mesh.geometry.drawRange.count < (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count)) continue;
    const layout = Object.entries(mesh.geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`).join("|");
    const key = `${material.uuid}/${part.reduced}/${part.castsShadow}/${mesh.renderOrder}/${mesh.layers.mask}/${Boolean(mesh.geometry.index)}/${layout}`;
    const group = groups.get(key) ?? []; group.push(part); groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1).map(parts => () => {
    const material = parts[0].mesh.material;
    if (Array.isArray(material)) throw new Error("City material batch requires one material");
    const vertices = parts.reduce((sum, part) => sum + part.mesh.geometry.getAttribute("position").count, 0);
    const indices = parts.reduce((sum, part) => sum + (part.mesh.geometry.index?.count ?? 0), 0);
    const batch = new BatchedMesh(parts.length * capacity, vertices, indices, material);
    batch.name = `city-material-batch/${material.name}/${parts[0].reduced ? "reduced" : "full"}`;
    batch.frustumCulled = false; batch.perObjectFrustumCulled = true; batch.sortObjects = false;
    batch.renderOrder = parts[0].mesh.renderOrder; batch.layers.mask = parts[0].mesh.layers.mask;
    batch.castShadow = parts[0].castsShadow; batch.visible = false;
    try {
      for (const part of parts) {
        const geometry = batch.addGeometry(part.mesh.geometry), ids: number[] = [];
        for (let i = 0; i < capacity; i++) { const id = batch.addInstance(geometry); batch.setVisibleAt(id, false); ids.push(id); }
        part.binding = { mesh: batch, ids, count: 0 };
      }
      attach(batch);
    } catch (reason) { batch.dispose(); throw reason; }
  });
}

export function updateCityDrawPart(part: CityDrawPart, indices: readonly number[], matrices: readonly Matrix4[], changed: boolean) {
  const { mesh, binding } = part;
  if (binding) {
    if (changed) indices.forEach((index, i) => binding.mesh.setMatrixAt(binding.ids[i], matrices[index]));
    for (let i = Math.min(indices.length, binding.count); i < Math.max(indices.length, binding.count); i++) {
      binding.mesh.setVisibleAt(binding.ids[i], i < indices.length);
    }
    binding.count = indices.length;
    // Visibility is shared by the other parts of this material batch. Individual
    // instances are culled separately in both the main and shadow camera passes.
    binding.mesh.visible = true;
  } else if (changed) {
    indices.forEach((index, i) => mesh.setMatrixAt(i, matrices[index]));
    if (indices.length) mesh.instanceMatrix.needsUpdate = true;
  }
  mesh.count = indices.length; mesh.visible = indices.length > 0;
}

export function warmCityMesh(mesh: CityRenderMesh, visible: boolean) {
  mesh.visible = visible;
  if (mesh instanceof BatchedMesh) mesh.setVisibleAt(0, visible);
  else mesh.count = visible ? 1 : 0;
}
