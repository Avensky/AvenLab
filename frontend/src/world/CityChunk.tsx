import { memo } from "react";
import { useRenderSettingsStore } from "../store/renderSettingsStore";
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
  const shadows = useRenderSettingsStore((s) => s.shadows);

  // Keep the GLB export origin and node transforms. The backend visual entry
  // supplies the asset-to-chunk transform; the parent supplies chunk-to-world.
  // Do not add Center, recenter bounding boxes, or guess a floor offset here.

  return (
    <group
      name={`city-asset-${path}`}
      position={position}
      quaternion={quaternion}
      scale={scale}
    >
      <Clone object={gltf.scene} inject={{ castShadow: shadows, receiveShadow: shadows }} />
    </group>
  );
});