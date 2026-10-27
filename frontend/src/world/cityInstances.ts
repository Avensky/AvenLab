import { Box3, Frustum, Group, InstancedMesh, Material, Matrix4, Mesh, MeshPhysicalMaterial, Quaternion, Texture, Vector3, type Object3D } from "three";
import type { CityPlacement } from "./cityLod.ts";

type Batch = { mesh: InstancedMesh; local: Matrix4; bounds: Box3; matrices: Matrix4[]; boxes: Box3[]; visibleIndices: number[] };

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
export function createCityInstances(source: Object3D, capacity: number, fastGlass: boolean) {
  const objects: Mesh[] = []; let unsupported = false;
  source.updateWorldMatrix(true, true);
  source.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    if ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh || object instanceof InstancedMesh || object.morphTargetInfluences?.length || object.matrixWorld.determinant() < 0) unsupported = true;
    objects.push(object);
  });
  if (unsupported) return null;
  const group = new Group(); group.name = "instanced-city-asset";
  const materials = new Map<Material, Material>(), batches: Batch[] = [], textures = new Set<Texture>();
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
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    batches.push({ mesh, local: object.matrixWorld.clone(), bounds: object.geometry.boundingBox!.clone(), matrices: [], boxes: [], visibleIndices: [] });
    group.add(mesh);
  };
  let placements: readonly CityPlacement[] | null = null;
  const world = new Matrix4(), visual = new Matrix4(), rotation = new Quaternion(), position = new Vector3(), scale = new Vector3(), box = new Box3();
  const indices: number[] = [];
  const update = (next: readonly CityPlacement[], frustum: Frustum, shadows: boolean) => {
    if (next.length > capacity) throw new Error("City instance capacity exceeded");
    const moved = next !== placements;
    if (moved) {
      placements = next;
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
      batch.matrices.forEach((_, index) => {
        box.copy(batch.boxes[index]).applyMatrix4(group.matrixWorld);
        // Shadow casters outside the main view still matter to the shadow pass.
        if (shadows || frustum.intersectsBox(box)) indices.push(index);
      });
      const visible = indices.length;
      const changed = moved || visible !== batch.visibleIndices.length || indices.some((index, i) => index !== batch.visibleIndices[i]);
      if (changed) {
        indices.forEach((index, i) => batch.mesh.setMatrixAt(i, batch.matrices[index]));
        batch.visibleIndices = [...indices];
        if (visible) batch.mesh.instanceMatrix.needsUpdate = true;
      }
      batch.mesh.count = visible; batch.mesh.visible = visible > 0;
      batch.mesh.castShadow = shadows; batch.mesh.receiveShadow = shadows;
      count += visible;
    }
    return count;
  };
  return { group, batches, objects, textures, prepareMesh, update,
    dispose: () => { batches.forEach(batch => batch.mesh.dispose()); materials.forEach(material => material.dispose()); } };
}
