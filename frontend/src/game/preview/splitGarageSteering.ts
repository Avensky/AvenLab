import { Group, Mesh, type BufferGeometry, type Object3D, type Vector3 } from "three";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { partitionVehicleMesh } from "./ae86DriverDoor";
import { GARAGE_STEERING_PARTS } from "./garageSteeringParts";

/** Split the wheel along the export's existing seams. The shared GLB stays
 * intact, and range checks reject revised assets before changing geometry. */
export function splitGarageSteering(root: Object3D, model: VehicleModelId) {
  if (!(model in GARAGE_STEERING_PARTS)) return;
  return splitVehicleAssembly(root, GARAGE_STEERING_PARTS[model as keyof typeof GARAGE_STEERING_PARTS], "garage-steering-wheel")?.dispose;
}

type MeshPartition = { original: BufferGeometry; triangles: Uint32Array };
const partitions = new WeakMap<Mesh, MeshPartition>();

type AssemblyPart = {
  material: string; count: number; vertex: number;
  point: readonly number[]; ranges: readonly (readonly [number, number])[];
};

export function splitVehicleAssembly(root: Object3D, parts: readonly AssemblyPart[], name: string, pivot?: Vector3) {
  const meshes: Mesh[] = [];
  root.traverse(object => {
    if (object instanceof Mesh && !Array.isArray(object.material)) meshes.push(object);
  });
  const matches = parts.map(part => {
    const candidates = meshes.filter(mesh => !Array.isArray(mesh.material) &&
      mesh.material.name === part.material && (partitions.get(mesh)?.original ?? mesh.geometry).index?.count === part.count);
    return candidates.find(mesh => {
      const source = partitions.get(mesh)?.original ?? mesh.geometry;
      const positions = source.attributes.position;
      return source.index!.getX(part.ranges[0][0] * 3) === part.vertex &&
        part.point.every((value, axis) => Math.abs(positions.getComponent(part.vertex, axis) - value) < .0001);
    });
  });
  if (matches.some(mesh => !mesh?.parent)) return;
  const wheel = new Group();
  wheel.name = name;
  if (pivot) wheel.position.copy(pivot);
  root.add(wheel);
  root.updateWorldMatrix(true, true);
  const geometries = matches.map((match, index) => {
    const mesh = match!;
    const original = mesh.geometry;
    const previous = partitions.get(mesh);
    const triangles = previous?.triangles ?? Uint32Array.from({ length: original.index!.count / 3 }, (_, i) => i);
    const selected: [number, number][] = [], remaining: number[] = [];
    let range = 0;
    for (const [triangle, source] of triangles.entries()) {
      while (range < parts[index].ranges.length && source >= parts[index].ranges[range][1]) range++;
      if (range < parts[index].ranges.length && source >= parts[index].ranges[range][0]) {
        const last = selected[selected.length - 1];
        if (last?.[1] === triangle) last[1]++;
        else selected.push([triangle, triangle + 1]);
      } else remaining.push(source);
    }
    const { body, door: moving } = partitionVehicleMesh(mesh, selected);
    partitions.set(mesh, { original: previous?.original ?? original, triangles: Uint32Array.from(remaining) });
    mesh.geometry = body;
    const part = mesh.clone(false);
    part.geometry = moving;
    part.name = "steering-part-" + index;
    mesh.parent!.add(part);
    wheel.attach(part);
    return { mesh, original, body, moving, previous };
  });
  return { root: wheel, dispose: () => {
    for (const { mesh, original, body, moving, previous } of geometries) {
      mesh.geometry = original;
      if (previous) partitions.set(mesh, previous);
      else partitions.delete(mesh);
      body.dispose();
      moving.dispose();
    }
    wheel.removeFromParent();
  } };
}
