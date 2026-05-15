import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import type { DebugAabbBox } from "../../store/store";


export function GLBInstance({
  path,
  box,
}: {
  path: string;
  box: DebugAabbBox;
}) {

  const gltf = useGLTF(path);

  const scene = useMemo(() => {
    return SkeletonUtils.clone(gltf.scene);
  }, [gltf.scene]);

    const position: [number, number, number] = [
      box.center[0],
      box.center[1] - box.half_extents[1],
      box.center[2],
    ];

    return <primitive
        object={scene}
        position={position}
        quaternion={new THREE.Quaternion(0, 0, 0, 1)}
        dispose={null}
    />
}