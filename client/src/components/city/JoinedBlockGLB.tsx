import { useGLTF } from "@react-three/drei";

export function JoinedBlockGLB({ blockId }: { blockId: string }) {
  const path = `/models/blocks/${blockId}/${blockId}.glb`;
  const gltf = useGLTF(path);

  console.log("Loaded joined block:", path, gltf);

  return <primitive object={gltf.scene} dispose={null} />;
}

