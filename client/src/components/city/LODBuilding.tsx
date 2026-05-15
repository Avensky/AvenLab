import { memo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLBInstance } from "./GLBInstance";
import type { DebugAabbBox } from "../../store/store";

type Props = {
  path: string;
  box: DebugAabbBox;
  nearDistance?: number;
};

export const LODBuilding = memo(function LODBuilding({
  path,
  box,
  nearDistance = 220,
}: Props) {
  const { camera } = useThree();
  const [near, setNear] = useState(true);

  useFrame(() => {
    const dx = camera.position.x - box.center[0];
    const dy = camera.position.y - box.center[1];
    const dz = camera.position.z - box.center[2];

    const distSq = dx * dx + dy * dy + dz * dz;
    const shouldBeNear = distSq < nearDistance * nearDistance;

    if (shouldBeNear !== near) {
      setNear(shouldBeNear);
    }
  });

  if (near) {
    return <GLBInstance key={`${box.id}-${path}`} path={path} box={box} />;
  }

  return (
    <mesh
      position={[
        box.center[0],
        box.center[1],
        box.center[2],
      ]}
      frustumCulled
    >
      <boxGeometry
        args={[
          box.half_extents[0] * 2,
          box.half_extents[1] * 2,
          box.half_extents[2] * 2,
        ]}
      />
      <meshStandardMaterial color="#555555" roughness={1} metalness={0} />
    </mesh>
  );
});