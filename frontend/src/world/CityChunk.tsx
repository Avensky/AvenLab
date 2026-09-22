import { memo } from "react";
import { useGLTF } from "@react-three/drei";

type Props = {
  chunkId: string;
  position?: [number, number, number];
};

const CITY_MODEL_PATH = "/models/chuncks";

export const CityChunk = memo(function CityChunk({
  chunkId,
  position = [0, 0, 0],
}: Props) {
  // The exported assets currently live in public/models/chuncks.
  // A missing asset makes Vite return index.html, which produces the
  // "Unexpected token '<'" JSON error from GLTFLoader.
  const path = `${CITY_MODEL_PATH}/${chunkId}.glb`;
  const gltf = useGLTF(path);

  return (
    <group name={`city-chunk-${chunkId}`} position={position}>
      <primitive object={gltf.scene} dispose={null} />
    </group>
  );
});
