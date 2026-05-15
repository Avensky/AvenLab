import { useGLTF } from "@react-three/drei";
import { memo } from "react";
// import { memo, useMemo } from "react";
// import * as THREE from "three";

type Props = {
  blockId: string;
  visible: boolean;
};

export const BlockPreviewLOD = memo(function BlockPreviewLOD({
  blockId,
  visible,
}: Props) {
  const path = `/models/blocks/${blockId}/${blockId}_low.glb`;
  const gltf = useGLTF(path);
//   console.log(gltf)

//   const scene = useMemo(() => {
//     const clone = gltf.scene.clone(true);

//     clone.traverse((child) => {
//       if (!(child instanceof THREE.Mesh)) return;

//       child.castShadow = false;
//       child.receiveShadow = false;
//       child.frustumCulled = true;
//     });

//     return clone;
//   }, [gltf.scene]);

  if (!visible) return null;

  return <primitive object={gltf.scene} dispose={null} />;
});