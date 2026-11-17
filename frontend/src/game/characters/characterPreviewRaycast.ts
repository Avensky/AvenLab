import { SkinnedMesh, type Object3D, type Vector3 } from "three";

/** Preserve exact visible triangle hits while sharing vertex skinning within each ray. */
export function skipHiddenCharacterRaycasts(root: Object3D) {
  const restore: (() => void)[] = [];
  root.traverse(part => {
    if (!(part instanceof SkinnedMesh)) return;
    const raycast = part.raycast;
    const getVertexPosition = part.getVertexPosition;
    let positions: Float64Array | undefined;
    let sampled: Uint8Array | undefined;
    let vertexCount = 0;
    function cachedPosition(index: number, target: Vector3) {
      if (!positions || !sampled || sampled.length !== vertexCount) {
        positions = new Float64Array(vertexCount * 3);
        sampled = new Uint8Array(vertexCount);
      }
      const offset = index * 3;
      if (sampled[index]) return target.set(positions[offset], positions[offset + 1], positions[offset + 2]);
      getVertexPosition.call(part, index, target);
      positions[offset] = target.x;
      positions[offset + 1] = target.y;
      positions[offset + 2] = target.z;
      sampled[index] = 1;
      return target;
    }
    part.raycast = (raycaster, intersections) => {
      for (let ancestor: Object3D | null = part; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) return;
      }
      if (!part.geometry.index) return raycast.call(part, raycaster, intersections);
      // The mesh may switch fit or pose between events. Cache only this synchronous ray.
      vertexCount = part.geometry.getAttribute("position").count;
      sampled?.fill(0);
      part.getVertexPosition = cachedPosition;
      try {
        raycast.call(part, raycaster, intersections);
      } finally {
        part.getVertexPosition = getVertexPosition;
      }
    };
    restore.push(() => { part.raycast = raycast; });
  });
  return () => restore.forEach(reset => reset());
}
