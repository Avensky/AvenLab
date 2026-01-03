import { OrbitControls, useGLTF } from "@react-three/drei";
// import { WorldRenderer } from "./components/WorldRenderer";
import { ModeSwitcher } from "./components/ModeSwitcher";
// import { useSnapshots } from "./hooks/useSnapshots";
import { usePlayerInput } from "./hooks/usePlayerInput";
import { FullscreenCanvas } from "./layout/FullscreenCanvas";
// import { CityScene } from "./scenes/CityScene";
// import { HeightfieldGeneratorPanel } from "./tools/HeightfieldGeneratorPanel";
// import { CityHeightfield } from "./scenes/CityHeightfield";
// import { CityBuildingColliders } from "./scenes/CityBuildingColliders";
// import heightfieldJSON from '../../server/data/city-heightfield-v4.json'
import { useSnapshotStore } from "./store/store";
// import { BuildingColliderExporter } from "./tools/BuildingColliderExporter";
import { VehicleScene } from "./scenes/VehicleScene";
import { connectRustServer } from "./net/rustSocket";
import { useEffect } from "react";
import { NetworkWorld } from "./scenes/NetworkWorld";
import { DebugOverlay } from "./ui/DebugOverlay";
import { DebugVisualizer } from "./components/DebugVisualizer";
import { GroundPlane } from "./scenes/GroundPlane";

export default function App() {
  // useSnapshots();
  usePlayerInput();

  // useSnapshot();
  // const mode = useSnapshotStore(s => s.mode);
  // const { scene } = useGLTF("/models/city.glb");
  // const tick = useSnapshotStore((s) => s.snapshot?.tick);
  // const connected = useSnapshotStore((s) => s.connected);
  // const playerId = useSnapshotStore((s) => s.playerId);

  useEffect(() => {
    connectRustServer();
  }, []);

  return (
    <>
      {/* overlays */}
      <ModeSwitcher />
      <DebugOverlay />

      {/* Canvas */}
      <FullscreenCanvas>

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight intensity={1} position={[5, 5, 5]} />

        {/* YOU */}
        <VehicleScene />
        {/* <DebugVisualizer /> */}

        <GroundPlane />
        <OrbitControls />







        {/* <HeightfieldGeneratorPanel /> */}
        {/* <BuildingColliderExporter /> */}
        {/* <Grid infiniteGrid args={[10, 10]} /> */}
        {/* OTHER PLAYERS */}
        {/* <NetworkWorld />          */}
        {/* {mode === "glb" && <CityScene />} */}
        {/* {mode === "geometry" && <CityHeightfield data={heightfieldJSON} />} */}
        {/* {mode === "collider" && <CityBuildingColliders glb={scene} />} */}
        {/* <WorldRenderer /> */}
      </FullscreenCanvas>
    </>
  );
}
