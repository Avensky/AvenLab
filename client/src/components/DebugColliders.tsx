import * as THREE from "three";
import { useMemo } from "react";

export function DebugColliders({ boxes }: { boxes: {center:[number,number,number], half_extents:[number,number,number]}[] }) {
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.6 });
    return m;
  }, []);
//   console.log("Rendering DebugColliders with boxes:", boxes);

  return (
    <>
      {boxes.map((b, i) => (
        <mesh key={i} position={b.center} material={material}>
          <boxGeometry args={[b.half_extents[0]*2, b.half_extents[1]*2, b.half_extents[2]*2]} />
        </mesh>
      ))}
    </>
  );
}
