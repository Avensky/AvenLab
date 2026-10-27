import { Box3, Frustum, Group, InstancedMesh, Material, Matrix4, Mesh, MeshPhysicalMaterial, Quaternion, Texture, Vector3, type Object3D } from "three";
import type { CityPlacement } from "./cityLod.ts";
import { cityDrawBatchJobs, updateCityDrawPart, type CityDrawPart, type CityRenderMesh } from "./cityDrawBatches.ts";

type Batch = { mesh: InstancedMesh; reduced?: InstancedMesh; fullDraw: CityDrawPart; reducedDraw?: CityDrawPart; block?: string; local: Matrix4; bounds: Box3; matrices: Matrix4[]; boxes: Box3[]; visibleIndices: number[]; reducedIndices: number[] };
type CityInstanceOptions = { multiDraw?: boolean; castShadow?: boolean };

export function supportsCityInstancing(source: Object3D) {
  let supported = true;
  source.updateWorldMatrix(true, true);
  source.traverseVisible(object => {
    if (object instanceof Mesh && ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh
      || object instanceof InstancedMesh || object.morphTargetInfluences?.length || object.matrixWorld.determinant() < 0)) supported = false;
  });
  return supported;
}

// Same geometry/texture data as the GLB. Repeated tiles become instances instead
// of thousands of cloned React/Three objects. Unsupported animated rigs fall back.
export function createCityInstances(source: Object3D, capacity: number, fastGlass: boolean, reducedSource?: Object3D, options: CityInstanceOptions = {}) {
  const objects: Mesh[] = []; let unsupported = false;
  source.updateWorldMatrix(true, true);
  source.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    if ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh || object instanceof InstancedMesh || object.morphTargetInfluences?.length || object.matrixWorld.determinant() < 0) unsupported = true;
    objects.push(object);
  });
  if (unsupported) return null;
  const reducedObjects = new Map<string, Mesh>();
  reducedSource?.traverseVisible(object => { if (object instanceof Mesh) reducedObjects.set(object.name, object); });
  const group = new Group(); group.name = "instanced-city-asset";
  const materials = new Map<Material, Material>(), batches: Batch[] = [], textures = new Set<Texture>(), meshes: CityRenderMesh[] = [];
  const materialFor = (source: Material) => {
    const cached = materials.get(source); if (cached) return cached;
    if (!(source instanceof MeshPhysicalMaterial)) return source;
    const material = source.clone();
    const glass = source.name.trim().toLowerCase() === "glass";
    // The exported bricks/asphalt have transmission=1. They are solid surfaces.
    if (!glass || fastGlass) material.transmission = 0;
    if (fastGlass) {
      material.clearcoat = 0; material.sheen = 0; material.iridescence = 0;
      if (glass) { material.transparent = true; material.opacity = 0.32; material.alphaTest = 0; material.depthWrite = false; material.forceSinglePass = true; }
    }
    material.needsUpdate = true; materials.set(source, material); return material;
  };
  const prepareMesh = (object: Mesh) => {
    const material = Array.isArray(object.material) ? object.material.map(materialFor) : materialFor(object.material);
    for (const slot of [material].flat()) for (const value of Object.values(slot)) if (value instanceof Texture) textures.add(value);
    const mesh = new InstancedMesh(object.geometry, material, Math.max(1, capacity));
    mesh.name = object.name; mesh.userData = { ...object.userData }; mesh.renderOrder = object.renderOrder; mesh.layers.mask = object.layers.mask;
    mesh.frustumCulled = false; mesh.count = 0;
    let parent: Object3D | null = object, block: string | undefined;
    while (parent) { if (/^Block_[01]_[01]$/.test(parent.name)) { block = parent.name; break; } parent = parent.parent; }
    const low = block ? reducedObjects.get(object.name) : undefined;
    const reduced = low ? new InstancedMesh(low.geometry, material, Math.max(1, capacity)) : undefined;
    if (reduced) {
      reduced.name = `${object.name}__reduced`; reduced.frustumCulled = false; reduced.count = 0;
      reduced.renderOrder = object.renderOrder; reduced.layers.mask = object.layers.mask; group.add(reduced); meshes.push(reduced);
    }
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const castsShadow = options.castShadow !== false && [material].flat().some(slot => !slot.transparent && (!(slot instanceof MeshPhysicalMaterial) || slot.transmission === 0));
    mesh.castShadow = castsShadow;
    batches.push({ mesh, reduced, fullDraw: { mesh, reduced: false, castsShadow }, reducedDraw: reduced ? { mesh: reduced, reduced: true, castsShadow: false } : undefined,
      block, local: object.matrixWorld.clone(), bounds: object.geometry.boundingBox!.clone(), matrices: [], boxes: [], visibleIndices: [], reducedIndices: [] });
    group.add(mesh); meshes.push(mesh);
  };
  const prepareDrawBatches = () => {
    if (!options.multiDraw) return [];
    const parts = batches.flatMap(batch => batch.reducedDraw ? [batch.fullDraw, batch.reducedDraw] : [batch.fullDraw]);
    return cityDrawBatchJobs(parts, Math.max(1, capacity), mesh => {
      for (const part of parts) if (part.binding?.mesh === mesh) {
        group.remove(part.mesh); meshes.splice(meshes.indexOf(part.mesh), 1);
      }
      group.add(mesh); meshes.push(mesh);
    });
  };
  // Detail-level dictionaries change as the player moves. The authored city is
  // stationary: compare transform values, not the identity of a React plan array.
  const placementTransforms: number[][] = [];
  const stats = { transformRebuilds: 0 };
  const world = new Matrix4(), visual = new Matrix4(), rotation = new Quaternion(), position = new Vector3(), scale = new Vector3(), box = new Box3();
  const indices: number[] = [], reducedIndices: number[] = [];
  const update = (next: readonly CityPlacement[], frustum: Frustum, shadows: boolean, shadowFrusta?: readonly Frustum[]) => {
    if (next.length > capacity) throw new Error("City instance capacity exceeded");
    let moved = placementTransforms.length !== next.length;
    next.forEach(({ chunk, visual: asset }, i) => {
      const values = placementTransforms[i] ??= [];
      let index = 0;
      for (const tuple of [chunk.origin, asset.position, asset.rotation, asset.scale]) for (const value of tuple) {
        if (values[index] !== value) moved = true;
        values[index++] = value;
      }
    });
    placementTransforms.length = next.length;
    if (moved) {
      stats.transformRebuilds++;
      for (const batch of batches) {
        batch.matrices = []; batch.boxes = [];
        for (const { chunk, visual: asset } of next) {
          visual.compose(position.fromArray(asset.position), rotation.fromArray(asset.rotation), scale.fromArray(asset.scale));
          world.makeTranslation(...chunk.origin).multiply(visual).multiply(batch.local);
          batch.matrices.push(world.clone()); batch.boxes.push(batch.bounds.clone().applyMatrix4(world));
        }
      }
    }
    let count = 0;
    for (const batch of batches) {
      indices.length = 0;
      reducedIndices.length = 0;
      batch.matrices.forEach((_, index) => {
        box.copy(batch.boxes[index]).applyMatrix4(group.matrixWorld);
        const level = batch.block ? next[index].blocks?.[batch.block] ?? "full" : "full";
        if (level === "proxy") return;
        if (level === "reduced" && batch.reduced) {
          if (frustum.intersectsBox(box)) reducedIndices.push(index);
          return;
        }
        // Roads/glass receive light without casting opaque slabs. Offscreen
        // buildings are retained only if a live light can see their bounds.
        const casts = shadows && batch.fullDraw.castsShadow;
        if (frustum.intersectsBox(box) || (casts && (!shadowFrusta || shadowFrusta.some(light => light.intersectsBox(box))))) indices.push(index);
      });
      const visible = indices.length;
      const changed = moved || visible !== batch.visibleIndices.length || indices.some((index, i) => index !== batch.visibleIndices[i]);
      if (changed) {
        updateCityDrawPart(batch.fullDraw, indices, batch.matrices, true);
        batch.visibleIndices = [...indices];
      }
      batch.mesh.count = visible; batch.mesh.visible = visible > 0;
      const high = batch.fullDraw.binding?.mesh ?? batch.mesh;
      high.castShadow = shadows && batch.fullDraw.castsShadow; high.receiveShadow = shadows;
      count += visible;
      if (batch.reduced) {
        const changed = moved || reducedIndices.length !== batch.reducedIndices.length || reducedIndices.some((index, i) => index !== batch.reducedIndices[i]);
        if (changed) {
          updateCityDrawPart(batch.reducedDraw!, reducedIndices, batch.matrices, true);
          batch.reducedIndices = [...reducedIndices];
        }
        batch.reduced.count = reducedIndices.length; batch.reduced.visible = reducedIndices.length > 0;
        // Distant models receive shadows but do not expand the shadow-caster set.
        const low = batch.reducedDraw!.binding?.mesh ?? batch.reduced;
        low.castShadow = false; low.receiveShadow = shadows;
        count += reducedIndices.length;
      }
    }
    return count;
  };
  return { group, batches, objects, textures, meshes, stats, prepareMesh, prepareDrawBatches, update,
    dispose: () => { new Set([...meshes, ...batches.flatMap(batch => batch.reduced ? [batch.mesh, batch.reduced] : [batch.mesh])]).forEach(mesh => mesh.dispose()); materials.forEach(material => material.dispose()); } };
}
