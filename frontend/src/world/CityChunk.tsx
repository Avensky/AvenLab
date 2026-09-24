import { memo } from "react";
import { Clone, useGLTF } from "@react-three/drei";

type Props = {
  path: string;

  position?: [number, number, number];

  quaternion?: [
    number,
    number,
    number,
    number
  ];

  scale?: [
    number,
    number,
    number
  ];
};

export const CityChunk = memo(function CityChunk({
  path,
  position = [0, 0, 0],
  quaternion = [0, 0, 0, 1],
  scale = [1, 1, 1],
}: Props) {
  const gltf = useGLTF(path);

  return (
    <group
      name={`city-asset-${path}`}
      position={position}
      quaternion={quaternion}
      scale={scale}
    >
      <Clone object={gltf.scene} />
    </group>
  );
});