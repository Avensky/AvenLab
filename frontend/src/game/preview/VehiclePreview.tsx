import { Suspense } from "react";
import {
  Environment,
  Grid,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";

import { VehiclePreviewModel } from "./VehiclePreviewModel";
import { VehicleRotatingCamera } from "../../effects/VehicleRotatingCamera";

export function VehiclePreview() {
  return (
    <>
      <color attach="background" args={["#020617"]} />

      <PerspectiveCamera makeDefault fov={55} position={[0, 2.2, 7]} />

      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={2.4} />
      <directionalLight position={[-5, 4, -5]} intensity={0.8} />

      <Suspense fallback={null}>
        <VehiclePreviewModel />
        <Environment preset="night" />
      </Suspense>

      <Grid
        args={[20, 20]}
        position={[0, -0.02, 0]}
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1.2}
        fadeDistance={18}
        fadeStrength={1}
      />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={Math.PI / 8}
      />

      <VehicleRotatingCamera radius={7} height={2.4} speed={0.35} />
    </>
  );
}