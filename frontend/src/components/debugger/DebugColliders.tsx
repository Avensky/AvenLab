import { useLayoutEffect, useRef } from "react";
import { Color, InstancedMesh, Object3D } from "three";

type Box = { center: [number, number, number]; half_extents: [number, number, number]; kind?: string };

// One draw call per chunk instead of one geometry/material/draw per box.
export function DebugColliders({ boxes, solid = false }: { boxes: Box[]; solid?: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    const color = new Color();
    boxes.forEach((box, index) => {
      transform.position.fromArray(box.center);
      transform.scale.set(box.half_extents[0] * 2, box.half_extents[1] * 2, box.half_extents[2] * 2);
      transform.updateMatrix();
      mesh.current!.setMatrixAt(index, transform.matrix);
      mesh.current!.setColorAt(index, color.set(box.kind === "building" ? "#38bdf8" : "#64748b"));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [boxes]);
  if (!boxes.length) return null;
  return <instancedMesh ref={mesh} args={[undefined, undefined, boxes.length]}>
    <boxGeometry />
    <meshBasicMaterial wireframe={!solid} />
  </instancedMesh>;
}
