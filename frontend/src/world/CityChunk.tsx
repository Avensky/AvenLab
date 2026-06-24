import { memo } from "react";
import { useGLTF } from "@react-three/drei";

type Props = {
  chunkId: string;
};

export const CityChunk = memo(function CityChunk({ chunkId }: Props) {
  const path = `/models/blocks/${chunkId}/${chunkId}.glb`;
  const gltf = useGLTF(path);

  return (
    <group name={`city-chunk-${chunkId}`}>
      <primitive object={gltf.scene} dispose={null} />
    </group>
  );
});