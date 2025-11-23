import { OrbitControls, useGLTF } from "@react-three/drei";
// import { WorldRenderer } from "./components/WorldRenderer";
import { ModeSwitcher } from "./components/ModeSwitcher";
// import { useSnapshots } from "./hooks/useSnapshots";
// import { usePlayerInput } from "./hooks/usePlayerInput";
import { FullscreenCanvas } from "./layout/FullscreenCanvas";
import { CityScene } from "./scenes/CityScene";
import { HeightfieldGeneratorPanel } from "./tools/HeightfieldGeneratorPanel";
import { CityHeightfield } from "./scenes/CityHeightfield";
import { CityBuildingColliders } from "./scenes/CityBuildingColliders";
import heightfieldJSON from '../../server/data/city-heightfield-v4.json'
import { useSnapshotStore } from "./store/snapshotStore";
import { BuildingColliderExporter } from "./tools/BuildingColliderExporter";
import { NetworkVehicleScene } from "./scenes/NetworkVehicleScene";
import { connectRustServer } from "./net/rustSocket";
import { useEffect } from "react";

export default function App() {
  // useSnapshots();
  // usePlayerInput();

  // useSnapshot();
  const mode = useSnapshotStore(s => s.mode);
  const { scene } = useGLTF("/models/city.glb");
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const connected = useSnapshotStore((s) => s.connected);
  const playerId = useSnapshotStore((s) => s.playerId);
  // const tick = useSnapshotStore((s) => s.lastTick);

  useEffect(() => {
    connectRustServer();
  }, []);

  return (
    <>
      <ModeSwitcher />
      <HeightfieldGeneratorPanel />
      <BuildingColliderExporter />
      <div style={{
        position: "absolute",
        top: "1rem",
        right: "1rem",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}>
        <button>Physics: {connected ? "connected" : "disconnected"}</button>
        <button>Player: {playerId ?? "…connecting"}</button>
        <button>Tick: {snapshot?.tick ?? 0}</button>
      </div>
      <FullscreenCanvas>
        <ambientLight intensity={0.5} />
        <directionalLight intensity={1} position={[5, 5, 5]} />
        {/* <Grid infiniteGrid args={[10, 10]} /> */}

        <NetworkVehicleScene
          snapshot={snapshot} playerId={playerId}

        />

        {mode === "glb" && <CityScene />}
        {/* {mode === "glb" && <CityScene />} */}
        {mode === "geometry" && <CityHeightfield data={heightfieldJSON} />}
        {mode === "collider" && <CityBuildingColliders glb={scene} />}

        {/* <WorldRenderer /> */}
        <OrbitControls />
      </FullscreenCanvas>
    </>
  );
}
